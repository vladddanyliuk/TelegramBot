import { NextResponse } from "next/server";
import { issueAccessToken, requireAdminPasswordProvided } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const password = body?.password;
    if (typeof password !== "string" || password.length === 0) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    if (!requireAdminPasswordProvided(password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const { token, expiresAt } = await issueAccessToken();
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    console.error("POST /api/login error", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
