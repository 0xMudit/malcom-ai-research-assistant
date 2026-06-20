import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  deleteUserDocument,
  getUserDocuments,
  renameUserDocument,
  saveDocument,
} from "@/lib/database";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const maxUploadBytes = 2 * 1024 * 1024;
const maxStoredChars = 80_000;

const textLikeMimeTypes = new Set([
  "application/json",
  "application/xml",
  "application/x-ndjson",
  "application/x-yaml",
  "text/csv",
  "text/html",
  "text/javascript",
  "text/markdown",
  "text/plain",
  "text/tab-separated-values",
  "text/typescript",
  "text/xml",
  "text/x-python",
]);

const textLikeExtensions = [
  ".c",
  ".cpp",
  ".css",
  ".csv",
  ".go",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".log",
  ".md",
  ".py",
  ".rs",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
];

function isTextLikeFile(file: File) {
  const mimeType = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return (
    mimeType.startsWith("text/") ||
    textLikeMimeTypes.has(mimeType) ||
    textLikeExtensions.some((extension) => name.endsWith(extension))
  );
}

function normalizeText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxStoredChars);
}

function buildSummary(content: string) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "No readable text extracted.";
  }

  return compact.slice(0, 280);
}

function serializeDocument(document: {
  id: string;
  name: string;
  mime_type?: string;
  mimeType?: string;
  size: number;
  content: string;
  summary: string;
  created_at?: string;
  createdAt?: string;
}) {
  return {
    id: document.id,
    name: document.name,
    mimeType: document.mime_type || document.mimeType || "",
    size: document.size,
    content: document.content,
    summary: document.summary,
    createdAt:
      document.created_at || document.createdAt || new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ documents: [] });
  }

  const documents = await getUserDocuments(user.id);

  return NextResponse.json({
    documents: documents.map(serializeDocument),
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);

  if (Number.isFinite(contentLength) && contentLength > maxUploadBytes + 65_536) {
    return NextResponse.json(
      { error: "File is too large. Upload files up to 2 MB." },
      { status: 413 },
    );
  }

  const limit = checkRateLimit(request, {
    namespace: "documents",
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const user = await getUserFromRequest(request);
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file." }, { status: 400 });
  }

  if (file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: "File is too large. Upload files up to 2 MB." },
      { status: 413 },
    );
  }

  if (!isTextLikeFile(file)) {
    return NextResponse.json(
      {
        error:
          "This first version supports text, Markdown, CSV, JSON, code, and log files.",
      },
      { status: 415 },
    );
  }

  const content = normalizeText(await file.text());

  if (!content) {
    return NextResponse.json(
      { error: "No readable text was found in that file." },
      { status: 400 },
    );
  }

  const document = {
    id: crypto.randomUUID(),
    user_id: user?.id || "",
    name: file.name || "Untitled document",
    mime_type: file.type || "text/plain",
    size: file.size,
    content,
    summary: buildSummary(content),
    created_at: new Date().toISOString(),
  };

  if (user) {
    await saveDocument({
      id: document.id,
      userId: user.id,
      name: document.name,
      mimeType: document.mime_type,
      size: document.size,
      content: document.content,
      summary: document.summary,
    });
  }

  return NextResponse.json({ document: serializeDocument(document) });
}

export async function DELETE(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing document id." }, { status: 400 });
  }

  await deleteUserDocument(user.id, id);

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Sign in to rename documents." },
      { status: 401 },
    );
  }

  const { id, name } = await request.json().catch(() => ({
    id: "",
    name: "",
  }));

  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Missing document id." }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Document name is required." },
      { status: 400 },
    );
  }

  const nextName = name.slice(0, 180).trim();

  await renameUserDocument({
    userId: user.id,
    documentId: id,
    name: nextName,
  });

  return NextResponse.json({ ok: true, document: { id, name: nextName } });
}
