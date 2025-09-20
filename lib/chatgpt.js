import { createChatCompletion } from "@/lib/openai";
import { findFilesByName, matchRelevantChunks } from "@/lib/rag";

const SYSTEM_PROMPT = `You are a helpful assistant powering a Telegram bot. Respect the active namespace context and cite file names when using RAG snippets. If you cannot find relevant context, answer from general knowledge but mention the limitation.`;

function buildContextMessage(matches) {
  if (!matches.length) return null;
  const lines = matches.map(match => {
    const fileName = match.file?.file_name || "unknown-file";
    const fileNamespace = match.file?.namespace || "unknown";
    const similarity = match.similarity?.toFixed(3) ?? "?";
    return `File: ${fileName} [namespace: ${fileNamespace}] (similarity ${similarity})\n${match.content}`;
  });
  return {
    role: "system",
    content: `Context retrieved from knowledge base:\n\n${lines.join("\n\n")}`
  };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && typeof item.role === "string" && typeof item.content === "string")
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: item.content.trim()
    }))
    .filter(item => item.content.length > 0);
}

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "find_files_by_name",
        description:
          "Lookup files in the current namespace by full or partial file name. Use this when the user asks for a specific document.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Full or partial file name to search for."
            }
          },
          required: ["name"]
        }
      }
    }
  ];
}

export async function askWithRag({ prompt, namespace, history = [] }) {
  const matches = namespace
    ? await matchRelevantChunks({ namespace, query: prompt })
    : [];

  const convoHistory = sanitizeHistory(history);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    buildContextMessage(matches),
    ...convoHistory,
    { role: "user", content: prompt }
  ].filter(Boolean);

  const tools = buildTools();
  const toolResults = [];

  let response = await createChatCompletion({ messages, tools });

  while (true) {
    const choice = response.choices?.[0];
    const message = choice?.message;
    if (!message) {
      return {
        answer: "…",
        context: matches,
        toolResults
      };
    }

    if (message.tool_calls?.length) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") {
          continue;
        }

        if (toolCall.function?.name === "find_files_by_name") {
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch (error) {
            args = {};
          }

          const query = args.name || args.query || "";
          const results = namespace
            ? await findFilesByName({ namespace, query, limit: 10 })
            : [];

          toolResults.push({ query, results });

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ results })
          });
        } else {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: "Unknown tool" })
          });
        }
      }

      response = await createChatCompletion({ messages, tools });
      continue;
    }

    const content = message.content?.trim();
    return {
      answer: content && content.length > 0 ? content : "…",
      context: matches,
      toolResults
    };
  }
}
