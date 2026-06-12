import { saveFeedback } from "@/lib/database";
import { parseFeedbackInput } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const feedbackInput = parseFeedbackInput(body);

  if (!feedbackInput) {
    return Response.json(
      { error: "Send valid feedback details." },
      { status: 400 },
    );
  }

  saveFeedback({
    id: crypto.randomUUID(),
    ...feedbackInput,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || "unknown",
  });

  return Response.json({ ok: true });
}
