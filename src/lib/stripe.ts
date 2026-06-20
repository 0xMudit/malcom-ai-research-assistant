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

const planDetails = {
  pro: {
    envName: "STRIPE_PRICE_ID_PRO",
    name: "Malcom Pro",
  },
  enterprise: {
    envName: "STRIPE_PRICE_ID_ENTERPRISE",
    name: "Malcom Enterprise",
  },
} satisfies Record<PaidPlan, { envName: string; name: string }>;

export function getRequiredStripePriceValue(plan: PaidPlan = "pro") {
  const envName =
    plan === "enterprise"
      ? planDetails.enterprise.envName
      : planDetails.pro.envName;
  const priceValue = process.env[envName]?.trim();

  if (!priceValue) {
    throw new Error(
      `Set ${envName} to a Stripe price ID or test amount to create checkout sessions.`,
    );
  }

  return priceValue;
}

export function isStripePriceId(value: string) {
  return /^price_[A-Za-z0-9_]+$/.test(value.trim());
}

export function parseStripeAmountToCents(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");

  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const amount = normalized.includes(".")
    ? Math.round(Number(normalized) * 100)
    : Number(normalized);

  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function isValidStripePriceConfig(value: string) {
  return isStripePriceId(value) || parseStripeAmountToCents(value) !== null;
}

export function getStripeCheckoutLineItem(
  plan: PaidPlan,
): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceValue = getRequiredStripePriceValue(plan);

  if (isStripePriceId(priceValue)) {
    return {
      price: priceValue,
      quantity: 1,
    };
  }

  const unitAmount = parseStripeAmountToCents(priceValue);

  if (!unitAmount) {
    throw new Error(
      `${planDetails[plan].envName} must be a Stripe price ID like price_... or a numeric amount in cents such as 999.`,
    );
  }

  return {
    quantity: 1,
    price_data: {
      currency: (process.env.STRIPE_CURRENCY || "usd").toLowerCase(),
      unit_amount: unitAmount,
      recurring: {
        interval: "month",
      },
      product_data: {
        name: planDetails[plan].name,
        metadata: {
          app: "malcom",
          plan,
        },
      },
    },
  };
}

export function planFromStripePriceId(priceId: string): PaidPlan {
  if (
    process.env.STRIPE_PRICE_ID_ENTERPRISE &&
    priceId === process.env.STRIPE_PRICE_ID_ENTERPRISE.trim()
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
