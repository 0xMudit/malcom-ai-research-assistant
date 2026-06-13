import Link from "next/link";
import type { Metadata } from "next";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Billing Cancelled",
  description: "Your Malcom checkout was cancelled.",
};

export default function BillingCancelPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.narrowContent}`}>
        <div className={styles.notice}>
          <span className={styles.badge}>Checkout cancelled</span>
          <h1>No changes were made.</h1>
          <p className={styles.helperText}>
            Your current Malcom plan and usage state are unchanged.
          </p>
          <div className={styles.buttonRow}>
            <Link className={styles.button} href="/billing">
              Back to billing
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
