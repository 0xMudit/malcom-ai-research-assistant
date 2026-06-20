import { Suspense } from "react";
import type { Metadata } from "next";
import { PageChrome } from "@/components/PageChrome";
import { BillingSuccessClient } from "./BillingSuccessClient";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Billing Success",
  description: "Your Malcom checkout completed.",
};

export default function BillingSuccessPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.narrowContent}`}>
        <Suspense
          fallback={
            <div className={styles.notice}>
              <span className={styles.badge}>Activating</span>
              <h1>Finishing checkout.</h1>
              <p className={styles.helperText}>
                Activating your subscription with Stripe.
              </p>
            </div>
          }
        >
          <BillingSuccessClient />
        </Suspense>
      </section>
    </PageChrome>
  );
}
