import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/server";

const authEmailRedirectTo =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }

    if (!hasSupabaseAdminConfig()) {
      return NextResponse.json(
        { error: "Supabase service-role access is not configured." },
        { status: 503 },
      );
    }

    const { email } = await request.json();

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    const { error } =
      await createSupabaseAdminClient().auth.admin.inviteUserByEmail(
        email.trim(),
        {
          redirectTo: authEmailRedirectTo,
        },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Invite could not be sent.",
      },
      { status: 500 },
    );
  }
}
