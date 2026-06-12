import { getUserFromRequest } from "@/lib/auth";
import {
  deleteUserSession,
  getUserSessionMessages,
  getUserSessions,
  updateUserSession,
} from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to load saved chats." }, { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (sessionId) {
    const messages = await getUserSessionMessages(user.id, sessionId);
    return Response.json({ messages });
  }

  const sessions = await getUserSessions(user.id);
  return Response.json({ sessions });
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to update chats." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Chat was not updated." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";

  if (!sessionId) {
    return Response.json({ error: "Chat was not updated." }, { status: 400 });
  }

  await updateUserSession({
    userId: user.id,
    sessionId,
    title: typeof record.title === "string" ? record.title : undefined,
    folder: typeof record.folder === "string" ? record.folder : undefined,
    tags: typeof record.tags === "string" ? record.tags : undefined,
    pinned: typeof record.pinned === "boolean" ? record.pinned : undefined,
  });

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to delete chats." }, { status: 401 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || "";

  if (!sessionId) {
    return Response.json({ error: "Chat was not deleted." }, { status: 400 });
  }

  await deleteUserSession(user.id, sessionId);
  return Response.json({ ok: true });
}
