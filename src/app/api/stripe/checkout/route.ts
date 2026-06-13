import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserSubscription } from "@/lib/database";
import {
  type PaidPlan,
  getAppUrl,
  getRequiredStripePriceId,
  getStripeClient,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "Sign in before upgrading." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      plan?: unknown;
    };
    const plan: PaidPlan = body.plan === "enterprise" ? "enterprise" : "pro";
    const stripe = getStripeClient();
    const priceId = getRequiredStripePriceId(plan);
    const appUrl = getAppUrl();
    const subscription = await getUserSubscription(user.id);
    const customerId = subscription.stripe_customer_id || undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : user.email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      metadata: {
        user_id: user.id,
        price_id: priceId,
        plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          price_id: priceId,
          plan,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout could not be started.",
      },
      { status: 500 },
    );
  }
}
