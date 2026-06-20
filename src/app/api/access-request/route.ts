import { saveAccessRequest } from "@/lib/database";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseAccessRequestInput } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = checkRateLimit(request, {
    namespace: "access-request",
    limit: 5,
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
  const accessRequest = parseAccessRequestInput(body);

  if (!accessRequest) {
    return Response.json(
      { error: "Enter your name and a valid email address." },
      { status: 400 },
    );
  }

  await saveAccessRequest({
    id: crypto.randomUUID(),
    ...accessRequest,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || "unknown",
  });

  return Response.json({ ok: true });
}
