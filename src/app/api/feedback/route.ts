import { saveFeedback } from "@/lib/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseFeedbackInput } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkRateLimit(request, {
    namespace: "feedback",
    limit: 10,
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
  const feedbackInput = parseFeedbackInput(body);

  if (!feedbackInput) {
    return Response.json(
      { error: "Send valid feedback details." },
      { status: 400 },
    );
  }

  await saveFeedback({
    id: crypto.randomUUID(),
    ...feedbackInput,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || "unknown",
  });

  return Response.json({ ok: true });
}
