import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserUsageStatus } from "@/lib/database";
import { syncCheckoutSessionSubscription } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to activate this checkout." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: unknown;
    };
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json(
        { error: "Missing checkout session ID." },
        { status: 400 },
      );
    }

    const subscription = await syncCheckoutSessionSubscription(
      sessionId,
      user.id,
    );
    const usage = await getUserUsageStatus(user.id);

    return NextResponse.json({ subscription, usage });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Checkout could not be activated.";
    const status =
      message.includes("does not belong")
        ? 403
        : message.includes("not completed")
          ? 409
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
