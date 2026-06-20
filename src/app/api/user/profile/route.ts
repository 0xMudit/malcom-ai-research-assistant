import { getUserFromRequest } from "@/lib/auth";
import { getUserGfMemo, getUserProfile, saveUserProfile } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json({ error: "Sign in to load profile." }, { status: 401 });
  }

  const [profile, gfMemo] = await Promise.all([
    getUserProfile(user.id),
    getUserGfMemo(user.id),
  ]);

  return Response.json({ profile, gfMemo });
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
      typeof record.displayName === "string"
        ? record.displayName.replace(/\u0000/g, "").trim().slice(0, 120)
        : "",
    memory:
      typeof record.memory === "string"
        ? record.memory.replace(/\u0000/g, "").trim().slice(0, 4_000)
        : "",
  });

  return Response.json({ ok: true });
}
