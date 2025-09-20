import { NextResponse } from "next/server";
import { enforceAuth } from "@/lib/auth";
import { postTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run() {
  const channelId = process.env.CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "Missing CHANNEL_ID" }, { status: 500 });
  }

  try {
    const result = await postTelegram("sendMessage", {
      chat_id: channelId,
      text: "Hello from Next.js! 🚀"
    });
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

  return run();
}

export async function GET(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  return run();
}
