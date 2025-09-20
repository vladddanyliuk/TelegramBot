import { NextResponse } from "next/server";
import { enforceAuth } from "@/lib/auth";
import { postTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler() {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) {
    return NextResponse.json({ error: "Missing PUBLIC_BASE_URL" }, { status: 500 });
  }

  const secret = process.env.TELEGRAM_SECRET_TOKEN;
  const payload = {
    url: `${base.replace(/\/$/, "")}/api/telegram`,
    secret_token: secret || undefined,
    drop_pending_updates: true,
    allowed_updates: ["message", "channel_post"]
  };

  try {
    const result = await postTelegram("setWebhook", payload);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Telegram error" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  return handler();
}

export async function GET(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  return handler();
}
