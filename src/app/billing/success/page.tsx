import Link from "next/link";
import type { Metadata } from "next";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Billing Success",
  description: "Your Malcom checkout completed.",
};

export default function BillingSuccessPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.narrowContent}`}>
        <div className={styles.notice}>
          <span className={styles.badge}>Checkout complete</span>
          <h1>Thanks for upgrading.</h1>
          <p className={styles.helperText}>
            Stripe may take a moment to deliver the webhook that activates Pro on
            your account.
          </p>
          <div className={styles.buttonRow}>
            <Link className={styles.button} href="/billing">
              View billing
            </Link>
            <Link className={styles.secondaryButton} href="/">
              Return to chat
            </Link>
          </div>
        </div>
      </section>
    </PageChrome>
  );
}
