import { saveAccessRequest } from "@/lib/database";
import { parseAccessRequestInput } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const accessRequest = parseAccessRequestInput(body);

  if (!accessRequest) {
    return Response.json(
      { error: "Enter your name and a valid email address." },
      { status: 400 },
    );
  }

  saveAccessRequest({
    id: crypto.randomUUID(),
    ...accessRequest,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || "unknown",
  });

  return Response.json({ ok: true });
}
