import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserSubscription } from "@/lib/database";
import { getAppUrl, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "Sign in to manage billing." },
        { status: 401 },
      );
    }

    const subscription = await getUserSubscription(user.id);

    if (!subscription.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer is linked to this account yet." },
        { status: 400 },
      );
    }

    const session = await getStripeClient().billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getAppUrl()}/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Billing portal could not be opened.",
      },
      { status: 500 },
    );
  }
}
