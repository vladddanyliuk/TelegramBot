import { NextResponse } from "next/server";
import { enforceAuth } from "@/lib/auth";
import { ingestTextIntoRag, listFiles } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get("namespace");
    if (!namespace) {
      return NextResponse.json({ error: "namespace query param is required" }, { status: 400 });
    }
    const files = await listFiles({ namespace, limit: 100 });
    return NextResponse.json({ files });
  } catch (error) {
    console.error("GET /api/files error", error);
    return NextResponse.json({ error: error.message || "Failed to load files" }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await enforceAuth(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    const formData = await request.formData();
    const namespace = formData.get("namespace");
    const file = formData.get("file");
    const sourceUrl = formData.get("sourceUrl") || null;

    if (!namespace || typeof namespace !== "string") {
      return NextResponse.json({ error: "Namespace is required" }, { status: 400 });
    }

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    const allowedTypes = ["text/plain", "text/markdown", "application/json", ""];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }

    const text = await file.text();
    if (!text.trim()) {
      return NextResponse.json({ error: "File has no textual content" }, { status: 400 });
    }

    const result = await ingestTextIntoRag({
      namespace,
      fileName: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
      sourceType: sourceUrl ? "url" : "upload",
      sourceUrl,
      content: text
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("POST /api/files error", error);
    return NextResponse.json({ error: error.message || "Failed to upload" }, { status: 500 });
  }
}
