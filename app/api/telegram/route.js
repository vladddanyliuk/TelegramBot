import { NextResponse } from "next/server";
import { askWithRag } from "@/lib/chatgpt";
import {
  chunkForTelegram,
  sendChatAction,
  sendTelegramMessage
} from "@/lib/telegram";
import {
  clearActiveNamespaceForChat,
  appendChatHistory,
  findFilesByName,
  getActiveNamespaceForChat,
  listAvailableNamespaces,
  getRecentChatHistory,
  setActiveNamespaceForChat
} from "@/lib/rag";
import { enforceAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID ? String(process.env.ALLOWED_CHAT_ID) : null;

function commandRegex(name) {
  return new RegExp(`^\\/${name}(?:@\\S+)?`, "i");
}

function matchesCommand(text, name) {
  return commandRegex(name).test(text.trim());
}

function stripCommandPrefix(text, name) {
  return text.trim().replace(commandRegex(name), "").trim();
}

async function ensureNamespace(chatId, replyToMessageId) {
  const current = await getActiveNamespaceForChat(chatId);
  if (current) return current;

  const available = await listAvailableNamespaces(12);
  let response = "No namespace selected for this chat. Use /namespace <name> to choose one.";
  if (available.length) {
    response += `\nAvailable namespaces:\n${available
      .map(ns => `• ${ns}`)
      .join("\n")}`;
  }
  await sendTelegramMessage({
    chatId,
    text: response,
    replyToMessageId
  });
  return null;
}

async function handleFilesCommand(chatId, namespace, text, replyToMessageId) {
  const query = stripCommandPrefix(text, "files");
  if (!query) {
    await sendTelegramMessage({
      chatId,
      text: "Usage: /files <partial file name>",
      replyToMessageId
    });
    return;
  }

  const matches = await findFilesByName({ namespace, query, limit: 10 });
  if (!matches.length) {
    await sendTelegramMessage({
      chatId,
      text: `No files matching “${query}”.`,
      replyToMessageId
    });
    return;
  }

  const lines = matches.map(match => {
    const date = new Date(match.created_at).toISOString().split("T")[0];
    const sizeKb = match.size_bytes ? Math.round(match.size_bytes / 1024) : null;
    const sizeLabel = sizeKb ? `${sizeKb} KB` : "unknown size";
    return `• ${match.file_name}\n   (${sizeLabel}, uploaded ${date})`;
  });

  await sendTelegramMessage({
    chatId,
    text: `Active namespace: ${namespace}\n\nFound files:\n${lines.join("\n")}`,
    replyToMessageId
  });
}

async function handleNamespaceCommand(chatId, text, replyToMessageId) {
  const args = stripCommandPrefix(text, "namespace");
  if (!args) {
    const current = await getActiveNamespaceForChat(chatId);
    const available = await listAvailableNamespaces(12);
    let response = current
      ? `Current namespace: ${current}`
      : "No namespace selected for this chat.";
    if (available.length) {
      response += `\n\nAvailable namespaces:\n${available
        .map(ns => `• ${ns}`)
        .join("\n")}`;
    }
    response += "\n\nUse /namespace <name> to switch or /namespace clear to reset.";
    await sendTelegramMessage({ chatId, text: response, replyToMessageId });
    return;
  }

  if (/^(clear|reset)$/i.test(args)) {
    try {
      await clearActiveNamespaceForChat(chatId);
      await sendTelegramMessage({
        chatId,
        text: "Namespace cleared. Use /namespace <name> to pick a document context.",
        replyToMessageId
      });
    } catch (error) {
      await sendTelegramMessage({
        chatId,
        text: `Failed to clear namespace: ${error.message}`,
        replyToMessageId
      });
    }
    return;
  }

  try {
    const normalized = await setActiveNamespaceForChat(chatId, args);
    await sendTelegramMessage({
      chatId,
      text: `Namespace set to “${normalized}”. All answers will use this namespace until you change it.`,
      replyToMessageId
    });
  } catch (error) {
    await sendTelegramMessage({
      chatId,
      text: `Failed to set namespace: ${error.message}`,
      replyToMessageId
    });
  }
}

export async function POST(request) {
  try {
    const auth = await enforceAuth(request, { allowTelegramSecret: true });
    if (auth.error) {
      return auth.error;
    }

    const expectedSecret = process.env.TELEGRAM_SECRET_TOKEN;
    if (expectedSecret) {
      const provided = request.headers.get("x-telegram-bot-api-secret-token");
      if (provided !== expectedSecret) {
        return new Response("Invalid secret token", { status: 401 });
      }
    }

    let update = {};
    try {
      update = await request.json();
    } catch {
      update = {};
    }

    const message = update.message ?? update.channel_post;
    if (!message) {
      return new Response("No message to handle", { status: 200 });
    }

    const chatId = message?.chat?.id;
    const text = message?.text;
    if (!chatId || !text) {
      return new Response("Ignored non-text update", { status: 200 });
    }

    if (!ALLOWED_CHAT_ID) {
      console.error("ALLOWED_CHAT_ID env var is not configured");
      return new Response("Bot is not configured", { status: 500 });
    }

    if (String(chatId) !== ALLOWED_CHAT_ID) {
      await sendTelegramMessage({
        chatId,
        text: "This bot is not available in this chat.",
        replyToMessageId: message.message_id
      }).catch(() => {});
      return new Response("Unauthorized chat", { status: 200 });
    }

    const trimmedText = text.trim();

    if (matchesCommand(trimmedText, "help")) {
      await sendTelegramMessage({
        chatId,
        text: "Hi!\nCommands:\n/help – this help\n/reset – acknowledge reset\n/namespace <name> – choose the active knowledge namespace\n/namespace clear – remove the current namespace\n/files <query> – list files within the active namespace",
        replyToMessageId: message.message_id
      });
      return new Response("ok", { status: 200 });
    }

    if (matchesCommand(trimmedText, "reset")) {
      await sendTelegramMessage({
        chatId,
        text: "Context cleared (stateless bot). Fire away!",
        replyToMessageId: message.message_id
      });
      return new Response("ok", { status: 200 });
    }

    if (matchesCommand(trimmedText, "namespace")) {
      await handleNamespaceCommand(chatId, trimmedText, message.message_id);
      return new Response("ok", { status: 200 });
    }

    if (matchesCommand(trimmedText, "files")) {
      const namespace = await ensureNamespace(chatId, message.message_id);
      if (!namespace) {
        return new Response("ok", { status: 200 });
      }
      await handleFilesCommand(chatId, namespace, trimmedText, message.message_id);
      return new Response("ok", { status: 200 });
    }

    const namespace = await ensureNamespace(chatId, message.message_id);
    if (!namespace) {
      return new Response("ok", { status: 200 });
    }

    sendChatAction({ chatId, action: "typing" });

    const history = await getRecentChatHistory({ chatId, limit: 10 });
    const { answer } = await askWithRag({ prompt: text, namespace, history });
    const parts = chunkForTelegram(answer);

    for (let index = 0; index < parts.length; index += 1) {
      await sendTelegramMessage({
        chatId,
        text: parts[index],
        replyToMessageId: index === 0 ? message.message_id : undefined
      });
    }

    appendChatHistory({
      chatId,
      messages: [
        { role: "user", content: text },
        { role: "assistant", content: answer }
      ]
    }).catch(err => {
      console.error("appendChatHistory error", err);
    });

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
