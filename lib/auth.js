import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const rawTtl = Number(process.env.ACCESS_TOKEN_TTL_HOURS || 24);
const TOKEN_TTL_HOURS = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 24;
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || "";

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getTokenFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const headerToken = request.headers.get("x-access-token");
  if (headerToken) {
    return headerToken.trim();
  }
  return null;
}

export async function issueAccessToken() {
  if (!ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("rag_auth_tokens").insert({
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  if (error) {
    throw new Error(`Failed to store access token: ${error.message}`);
  }

  return { token, expiresAt };
}

export async function verifyAccessToken(token) {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("rag_auth_tokens")
    .select("token_hash, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("verifyAccessToken error", error);
    return false;
  }

  if (!data) {
    return false;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    await supabase
      .from("rag_auth_tokens")
      .delete()
      .eq("token_hash", tokenHash);
    return false;
  }

  return true;
}

export async function enforceAuth(request, { allowTelegramSecret = false } = {}) {
  const token = getTokenFromRequest(request);
  if (token && (await verifyAccessToken(token))) {
    return { token };
  }

  if (allowTelegramSecret && TELEGRAM_SECRET_TOKEN) {
    const provided = request.headers.get("x-telegram-bot-api-secret-token");
    if (provided && provided === TELEGRAM_SECRET_TOKEN) {
      return { telegramSecret: true };
    }
  }

  return {
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  };
}

export function requireAdminPasswordProvided(password) {
  if (!ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }
  return ADMIN_PASSWORD === password;
}
