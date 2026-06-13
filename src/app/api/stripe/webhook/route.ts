import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  findSubscriptionOwnerByStripeIds,
  upsertUserSubscription,
} from "@/lib/database";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function idFromStripeValue(value: string | { id: string } | null | undefined) {
  if (!value) {
    return "";
  }

  return typeof value === "string" ? value : value.id;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const topLevelPeriodEnd = (subscription as unknown as {
    current_period_end?: unknown;
  }).current_period_end;
  const periodEnd =
    typeof topLevelPeriodEnd === "number"
      ? topLevelPeriodEnd
      : subscription.items.data[0]?.current_period_end;

  return typeof periodEnd === "number"
    ? new Date(periodEnd * 1000).toISOString()
    : null;
}

async function saveSubscription(subscription: Stripe.Subscription, userIdHint = "") {
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = idFromStripeValue(subscription.customer);
  const userId =
    userIdHint ||
    subscription.metadata?.user_id ||
    (await findSubscriptionOwnerByStripeIds({
      stripeCustomerId,
      stripeSubscriptionId,
    })) ||
    "";

  if (!userId) {
    return;
  }

  await upsertUserSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: subscription.items.data[0]?.price.id || "",
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Set STRIPE_WEBHOOK_SECRET to receive Stripe webhooks." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    event = getStripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook signature verification failed.",
      },
      { status: 400 },
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = idFromStripeValue(session.subscription);
      const userId = session.metadata?.user_id || session.client_reference_id || "";

      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(
          subscriptionId,
        );

        await saveSubscription(subscription, userId);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await saveSubscription(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook could not update subscription state.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
