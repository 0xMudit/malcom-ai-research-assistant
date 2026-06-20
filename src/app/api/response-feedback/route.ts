import { saveResponseFeedback } from "@/lib/database";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

export async function POST(request: Request) {
  const limit = checkRateLimit(request, {
    namespace: "response-feedback",
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });

  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Response action was not saved." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const messageId = text(record.messageId, 120);
  const comment = text(record.comment, 1200);
  const reaction = record.reaction;

  if (
    !messageId ||
    (reaction !== "like" && reaction !== "dislike" && reaction !== "comment") ||
    (reaction === "comment" && !comment)
  ) {
    return Response.json({ error: "Response action was not saved." }, { status: 400 });
  }

  await saveResponseFeedback({
    id: crypto.randomUUID(),
    messageId,
    reaction,
    comment,
  });

  return Response.json({ ok: true });
}
