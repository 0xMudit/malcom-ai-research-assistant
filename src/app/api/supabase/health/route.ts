import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  createSupabaseServerClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getSupabasePublicConfig();

  if (!config) {
    return NextResponse.json({
      configured: false,
      connected: false,
      adminConfigured: hasSupabaseAdminConfig(),
      error:
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable Supabase.",
    });
  }

  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.getSession();

    return NextResponse.json({
      configured: true,
      connected: !error,
      adminConfigured: hasSupabaseAdminConfig(),
      error: error?.message || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        adminConfigured: hasSupabaseAdminConfig(),
        error:
          error instanceof Error
            ? error.message
            : "Supabase health check failed.",
      },
      { status: 500 },
    );
  }
}
