import { getSupabaseClient } from "@/lib/supabase";
import { embedTexts } from "@/lib/openai";

const DEFAULT_CHUNK_SIZE = 1500;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_MATCH_COUNT = 6;
const DEFAULT_MIN_SIMILARITY = 0.3;

function normalizeNamespace(ns) {
  if (!ns || typeof ns !== "string") {
    throw new Error("Namespace is required for RAG operations");
  }
  const trimmed = ns.trim();
  if (!trimmed) {
    throw new Error("Namespace must not be empty");
  }
  return trimmed;
}

function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = {}) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function estimateTokens(text) {
  return Math.max(1, Math.round(text.length / 4));
}

export async function ingestTextIntoRag({
  namespace,
  fileName,
  mimeType,
  sizeBytes,
  sourceType = "upload",
  sourceUrl = null,
  content
}) {
  const trimmedNamespace = normalizeNamespace(namespace);
  if (!content || typeof content !== "string") {
    throw new Error("Content must be a non-empty string");
  }

  const chunks = chunkText(content);
  if (chunks.length === 0) {
    throw new Error("Content is empty after preprocessing");
  }

  const embeddings = await embedTexts(chunks);
  const tokenCounts = chunks.map(estimateTokens);
  const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0);

  const supabase = getSupabaseClient();
  const { data: fileRows, error: fileError } = await supabase
    .from("rag_files")
    .insert({
      namespace: trimmedNamespace,
      source_type: sourceType,
      source_url: sourceUrl,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      tokens: totalTokens
    })
    .select()
    .single();

  if (fileError) {
    throw new Error(`Failed to insert file metadata: ${fileError.message}`);
  }

  const payload = chunks.map((chunk, index) => ({
    file_id: fileRows.id,
    chunk_index: index,
    content: chunk,
    embedding: embeddings[index],
    token_count: tokenCounts[index]
  }));

  const { error: chunkError } = await supabase.from("rag_chunks").insert(payload);
  if (chunkError) {
    throw new Error(`Failed to insert chunks: ${chunkError.message}`);
  }

  return {
    file: fileRows,
    chunkCount: payload.length
  };
}

export async function matchRelevantChunks({
  namespace,
  query,
  matchCount = DEFAULT_MATCH_COUNT,
  minSimilarity = DEFAULT_MIN_SIMILARITY
}) {
  const trimmedNamespace = normalizeNamespace(namespace);
  if (!query || typeof query !== "string") {
    return [];
  }

  const [queryEmbedding] = await embedTexts([query]);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    ns: trimmedNamespace,
    min_similarity: minSimilarity
  });

  if (error) {
    console.error("rag.match_chunks error", error);
    return [];
  }

  const rows = data ?? [];
  if (!rows.length) return [];

  return rows.map(row => ({
    ...row,
    file: {
      id: row.file_id,
      namespace: row.file_namespace,
      file_name: row.file_name,
      source_type: row.source_type,
      source_url: row.source_url,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      tokens: row.tokens,
      created_at: row.file_created_at
    }
  }));
}

export async function findFilesByName({ namespace, query, limit = 5 }) {
  const trimmedNamespace = normalizeNamespace(namespace);
  const term = query?.trim();
  if (!term) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_files")
    .select("id, file_name, source_type, source_url, mime_type, size_bytes, tokens, created_at")
    .eq("namespace", trimmedNamespace)
    .ilike("file_name", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("findFilesByName error", error);
    return [];
  }

  return data ?? [];
}

export async function listFiles({ namespace, limit = 20 }) {
  const trimmedNamespace = normalizeNamespace(namespace);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_files")
    .select("id, file_name, created_at, size_bytes, tokens, source_type, source_url")
    .eq("namespace", trimmedNamespace)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listFiles error", error);
    return [];
  }

  return data ?? [];
}

function normalizeChatId(chatId) {
  if (chatId === undefined || chatId === null) {
    throw new Error("chatId is required");
  }
  return String(chatId);
}

export async function getActiveNamespaceForChat(chatId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_chat_namespaces")
    .select("namespace")
    .eq("chat_id", normalizeChatId(chatId))
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("getActiveNamespaceForChat error", error);
    return null;
  }

  return data?.namespace ?? null;
}

export async function setActiveNamespaceForChat(chatId, namespace) {
  const supabase = getSupabaseClient();
  const normalizedNamespace = normalizeNamespace(namespace);
  const payload = {
    chat_id: normalizeChatId(chatId),
    namespace: normalizedNamespace,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("rag_chat_namespaces")
    .upsert(payload, { onConflict: "chat_id" });

  if (error) {
    throw new Error(`Failed to set namespace: ${error.message}`);
  }

  return normalizedNamespace;
}

export async function clearActiveNamespaceForChat(chatId) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("rag_chat_namespaces")
    .delete()
    .eq("chat_id", normalizeChatId(chatId));

  if (error) {
    throw new Error(`Failed to clear namespace: ${error.message}`);
  }
}

export async function listAvailableNamespaces(limit = 20) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_files")
    .select("namespace")
    .order("namespace", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("listAvailableNamespaces error", error);
    return [];
  }

  const seen = new Set();
  const namespaces = [];
  for (const row of data ?? []) {
    const ns = row.namespace?.trim();
    if (ns && !seen.has(ns)) {
      seen.add(ns);
      namespaces.push(ns);
    }
  }

  return namespaces;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(msg => msg && typeof msg.content === "string" && typeof msg.role === "string")
    .map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content.trim()
    }))
    .filter(msg => msg.content.length > 0);
}

export async function appendChatHistory({ chatId, messages, retain = 40 }) {
  const supabase = getSupabaseClient();
  const normalizedChatId = normalizeChatId(chatId);
  const entries = normalizeMessages(messages);
  if (!entries.length) return;

  const payload = entries.map(entry => ({
    chat_id: normalizedChatId,
    role: entry.role,
    content: entry.content
  }));

  const { error: insertError } = await supabase.from("rag_chat_history").insert(payload);
  if (insertError) {
    console.error("appendChatHistory insert error", insertError);
    return;
  }

  if (retain > 0) {
    const { data: staleRows, error: selectError } = await supabase
      .from("rag_chat_history")
      .select("id")
      .eq("chat_id", normalizedChatId)
      .order("created_at", { ascending: false })
      .range(retain, retain + 499);

    if (!selectError && staleRows && staleRows.length) {
      const idsToDelete = staleRows.map(row => row.id);
      await supabase.from("rag_chat_history").delete().in("id", idsToDelete);
    }
  }
}

export async function getRecentChatHistory({ chatId, limit = 10 }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_chat_history")
    .select("role, content, created_at")
    .eq("chat_id", normalizeChatId(chatId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentChatHistory error", error);
    return [];
  }

  return (data ?? []).reverse();
}
