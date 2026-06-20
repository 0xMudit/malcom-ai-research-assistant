"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "@/app/app-pages.module.css";

type UsageStatus = {
  plan: "free" | "pro" | "enterprise";
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

const billingNoticeKey = "malcom.billing.notice.v1";

function readablePlan(plan: UsageStatus["plan"] | undefined) {
  if (plan === "enterprise") {
    return "Enterprise";
  }

  if (plan === "pro") {
    return "Pro";
  }

  return "Free";
}

export function BillingSuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") || "";
  const hasSyncedRef = useRef(false);
  const [status, setStatus] = useState<"syncing" | "active" | "login" | "error">(
    sessionId ? "syncing" : "error",
  );
  const [message, setMessage] = useState(
    sessionId
      ? "Activating your subscription with Stripe."
      : "Stripe did not return a checkout session ID.",
  );

  const redirectToChat = useCallback(
    (input: {
      kind: "success" | "error" | "info";
      title: string;
      message: string;
      plan?: string;
    }) => {
      try {
        window.localStorage.setItem(
          billingNoticeKey,
          JSON.stringify({
            kind: input.kind,
            title: input.title,
            message: input.message,
          }),
        );
      } catch {
        // The URL carries a fallback notice if localStorage is unavailable.
      }

      const url = new URL("/", window.location.origin);
      url.searchParams.set(
        "billing",
        input.kind === "success"
          ? "success"
          : input.kind === "info"
            ? "cancelled"
            : "failed",
      );

      if (input.plan) {
        url.searchParams.set("plan", input.plan);
      }

      url.searchParams.set("billing_message", input.message);
      window.location.replace(url.toString());
    },
    [],
  );

  useEffect(() => {
    if (hasSyncedRef.current) {
      return;
    }

    hasSyncedRef.current = true;

    if (!sessionId) {
      redirectToChat({
        kind: "error",
        title: "Payment needs attention",
        message: "Stripe did not return a checkout session ID.",
      });
      return;
    }

    async function syncSession() {
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        setStatus("error");
        const nextMessage =
          "Supabase Auth is not configured, so checkout cannot be linked.";
        setMessage(nextMessage);
        redirectToChat({
          kind: "error",
          title: "Payment needs attention",
          message: nextMessage,
        });
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setStatus("login");
        const nextMessage =
          "Sign in with the same account to activate this checkout.";
        setMessage(nextMessage);
        redirectToChat({
          kind: "error",
          title: "Payment needs sign in",
          message: nextMessage,
        });
        return;
      }

      try {
        const response = await fetch("/api/stripe/sync-session", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        });
        const result = await readApiJson<{ usage?: UsageStatus }>(
          response,
          "Checkout could not be activated.",
        );

        if (!response.ok || !result.usage) {
          throw new Error(result.error || "Checkout could not be activated.");
        }

        setStatus("active");
        const nextMessage = `${readablePlan(
          result.usage.plan,
        )} is active. Upgrade benefits are available now.`;
        setMessage(nextMessage);
        redirectToChat({
          kind: "success",
          title: "Payment complete",
          message: nextMessage,
          plan: result.usage.plan,
        });
      } catch (error) {
        setStatus("error");
        const nextMessage =
          error instanceof Error
            ? error.message
            : "Checkout could not be activated.";
        setMessage(nextMessage);
        redirectToChat({
          kind: "error",
          title: "Payment needs attention",
          message: nextMessage,
        });
      }
    }

    void syncSession();
  }, [redirectToChat, sessionId]);

  return (
    <div className={styles.notice}>
      <span className={styles.badge}>
        {status === "active"
          ? "Plan active"
          : status === "syncing"
            ? "Activating"
            : status === "login"
              ? "Sign in needed"
              : "Checkout needs review"}
      </span>
      <h1>
        {status === "active"
          ? "Upgrade complete."
          : status === "syncing"
            ? "Finishing checkout."
            : "Checkout completed."}
      </h1>
      <p className={styles.helperText}>{message}</p>
      <p className={styles.helperText}>Redirecting to chat...</p>
    </div>
  );
}
