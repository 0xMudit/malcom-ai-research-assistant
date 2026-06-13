import { getUserFromRequest } from "@/lib/auth";
import { getUserUsageStatus } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);

  if (!user) {
    return Response.json(
      { error: "Sign in to load usage." },
      { status: 401 },
    );
  }

  return Response.json({ usage: await getUserUsageStatus(user.id) });
}
