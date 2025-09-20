import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.warn("Missing SUPABASE_URL environment variable");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

let client;

export function getSupabaseClient() {
  if (!client) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }

    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { "X-Client-Info": "telegram-chatgpt-bot" } }
    });
  }

  return client;
}
