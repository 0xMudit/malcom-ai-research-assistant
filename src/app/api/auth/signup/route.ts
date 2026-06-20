import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const authEmailRedirectTo =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(request, {
      namespace: "auth-signup",
      limit: 8,
      windowMs: 60 * 60 * 1000,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        },
      );
    }

    const { email, password } = await request.json();

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 180 ||
      password.length < 8 ||
      password.length > 256
    ) {
      return NextResponse.json(
        { error: "Enter a valid email and a password with at least 8 characters." },
        { status: 400 },
      );
    }

    const { data, error } = await createSupabaseServerClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: authEmailRedirectTo,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      user: data.user,
      session: data.session,
      emailRedirectTo: authEmailRedirectTo,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Account could not be created.",
      },
      { status: 500 },
    );
  }
}
