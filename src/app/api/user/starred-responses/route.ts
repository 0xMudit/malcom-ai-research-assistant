import { getUserFromRequest } from "@/lib/auth";
import { getStarredResponses, setStarredResponse } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, maxLength)
    : "";
}

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json(
      { error: "Sign in to load starred responses." },
      { status: 401 },
    );
  }

  return Response.json({ starred: await getStarredResponses(user.id) });
}

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json(
      { error: "Sign in to star responses." },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Star was not saved." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const messageId = text(record.messageId, 120);
  const sessionId = text(record.sessionId, 120);
  const content = text(record.content, 20_000);
  const starred = Boolean(record.starred);

  if (!messageId || !sessionId || (starred && !content)) {
    return Response.json({ error: "Star was not saved." }, { status: 400 });
  }

  await setStarredResponse({
    userId: user.id,
    messageId,
    sessionId,
    content,
    starred,
  });

  return Response.json({ ok: true });
}
