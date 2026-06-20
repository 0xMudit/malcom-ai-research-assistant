import "server-only";

import Stripe from "stripe";
import {
  findSubscriptionOwnerByStripeIds,
  upsertUserSubscription,
} from "@/lib/database";
import { getStripeClient } from "@/lib/stripe";

export function idFromStripeValue(
  value: string | { id: string } | null | undefined,
) {
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

export async function saveStripeSubscription(
  subscription: Stripe.Subscription,
  userIdHint = "",
) {
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
    return null;
  }

  const configuredPriceValue =
    subscription.metadata?.price_id || subscription.items.data[0]?.price.id || "";

  await upsertUserSubscription({
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: configuredPriceValue,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  });

  return {
    userId,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId: configuredPriceValue,
    status: subscription.status,
    currentPeriodEnd: subscriptionPeriodEnd(subscription),
  };
}

export async function syncCheckoutSessionSubscription(
  sessionId: string,
  userId: string,
) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  const sessionUserId = session.metadata?.user_id || session.client_reference_id;

  if (sessionUserId !== userId) {
    throw new Error("This checkout session does not belong to this account.");
  }

  if (session.mode !== "subscription") {
    throw new Error("This checkout session is not a subscription checkout.");
  }

  if (session.status !== "complete") {
    throw new Error("Checkout has not completed yet.");
  }

  const expandedSubscription = session.subscription;
  const subscription =
    expandedSubscription && typeof expandedSubscription !== "string"
      ? expandedSubscription
      : expandedSubscription
        ? await stripe.subscriptions.retrieve(expandedSubscription)
        : null;

  if (!subscription) {
    throw new Error("Checkout completed without a Stripe subscription.");
  }

  return saveStripeSubscription(subscription, userId);
}
