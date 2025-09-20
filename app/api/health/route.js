import { NextResponse } from "next/server";
import { enforceAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json({ ok: true });
}
