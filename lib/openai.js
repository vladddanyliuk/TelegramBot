import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY");
}

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function getChatModel() {
  return CHAT_MODEL;
}

export function getEmbeddingModel() {
  return EMBEDDING_MODEL;
}

export async function embedTexts(texts) {
  const inputs = Array.isArray(texts) ? texts : [texts];
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs
  });
  return response.data.map(item => item.embedding);
}

export async function createChatCompletion({ messages, tools, temperature = 0.5 }) {
  return openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    tools,
    temperature
  });
}
