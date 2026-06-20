import { NextResponse } from "next/server";
import { getPublicAppHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getPublicAppHealth();

  return NextResponse.json(health, {
    status: health.status === "fail" ? 503 : 200,
  });
}
