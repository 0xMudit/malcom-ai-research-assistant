import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  idFromStripeValue,
  saveStripeSubscription,
} from "@/lib/billing";
import { getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = idFromStripeValue(session.subscription);
      const userId = session.metadata?.user_id || session.client_reference_id || "";

      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(
          subscriptionId,
        );

        await saveStripeSubscription(subscription, userId);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await saveStripeSubscription(event.data.object as Stripe.Subscription);
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
