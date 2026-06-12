import { getUserFromRequest } from "@/lib/auth";
import { getUserProfile, saveUserProfile } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to load profile." }, { status: 401 });
  }

  return Response.json({ profile: await getUserProfile(user.id) });
}

export async function PATCH(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to save profile." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Profile was not saved." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;

  await saveUserProfile({
    userId: user.id,
    displayName:
      typeof record.displayName === "string" ? record.displayName : "",
    memory: typeof record.memory === "string" ? record.memory : "",
  });

  return Response.json({ ok: true });
}
