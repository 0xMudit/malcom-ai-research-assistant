import "server-only";

import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Set STRIPE_SECRET_KEY to use Stripe billing.");
  }

  if (!stripe) {
    stripe = new Stripe(secretKey);
  }

  return stripe;
}

export type PaidPlan = "pro" | "enterprise";

export function getRequiredStripePriceId(plan: PaidPlan = "pro") {
  const envName =
    plan === "enterprise" ? "STRIPE_PRICE_ID_ENTERPRISE" : "STRIPE_PRICE_ID_PRO";
  const priceId = process.env[envName];

  if (!priceId) {
    throw new Error(`Set ${envName} to create checkout sessions.`);
  }

  return priceId;
}

export function planFromStripePriceId(priceId: string): PaidPlan {
  if (
    process.env.STRIPE_PRICE_ID_ENTERPRISE &&
    priceId === process.env.STRIPE_PRICE_ID_ENTERPRISE
  ) {
    return "enterprise";
  }

  return "pro";
}

export function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
