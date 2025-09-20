const TG_API = "https://api.telegram.org";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function tgApiUrl(method) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  return `${TG_API}/bot${token}/${method}`;
}

export function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function chunkForTelegram(text, limit = 4096) {
  if (text.length <= limit) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks;
}

export async function postTelegram(method, payload) {
  const res = await fetch(tgApiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Telegram API ${method} failed (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sendTelegramMessage({ chatId, text, replyToMessageId }) {
  const safe = escapeHtml(text);
  try {
    return await postTelegram("sendMessage", {
      chat_id: chatId,
      text: safe,
      parse_mode: "HTML",
      reply_to_message_id: replyToMessageId
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function sendChatAction({ chatId, action }) {
  try {
    await postTelegram("sendChatAction", { chat_id: chatId, action });
  } catch (error) {
    console.warn("sendChatAction failed", error?.message || error);
  }
}
