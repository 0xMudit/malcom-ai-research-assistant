import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getUserSubscription } from "@/lib/database";
import {
  type PaidPlan,
  getAppUrl,
  getRequiredStripePriceValue,
  getStripeCheckoutLineItem,
  getStripeClient,
  planFromStripePriceId,
} from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isActiveSubscriptionStatus(status: string) {
  return status === "active" || status === "trialing";
}

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
    const priceValue = getRequiredStripePriceValue(plan);
    const appUrl = getAppUrl();
    const subscription = await getUserSubscription(user.id);
    const customerId = subscription.stripe_customer_id || undefined;
    const hasActiveSubscription = isActiveSubscriptionStatus(subscription.status);
    const activePlan = hasActiveSubscription
      ? planFromStripePriceId(subscription.stripe_price_id)
      : "free";

    if (
      hasActiveSubscription &&
      (activePlan === plan || activePlan === "enterprise")
    ) {
      return NextResponse.json({
        url: `${appUrl}/?billing=success&plan=${activePlan}&billing_message=${encodeURIComponent(
          `${activePlan === "enterprise" ? "Enterprise" : "Pro"} is already active.`,
        )}`,
      });
    }

    if (hasActiveSubscription && customerId) {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${appUrl}/billing`,
      });

      return NextResponse.json({ url: portalSession.url });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_email: customerId ? undefined : user.email || undefined,
      line_items: [getStripeCheckoutLineItem(plan)],
      allow_promotion_codes: true,
      client_reference_id: user.id,
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?billing=cancelled`,
      metadata: {
        user_id: user.id,
        price_id: priceValue,
        plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          price_id: priceValue,
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
