import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const authEmailRedirectTo =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required." },
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
