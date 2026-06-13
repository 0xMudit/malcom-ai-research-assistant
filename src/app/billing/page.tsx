import type { Metadata } from "next";
import { AccountDashboard } from "@/components/AccountDashboard";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Billing",
  description: "Manage Malcom usage limits and paid subscription billing.",
};

export default function BillingPage() {
  return (
    <PageChrome>
      <section className={styles.content}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Billing</span>
          <h1>Subscription and usage</h1>
          <p>
            See your current plan, free-tier limits, cooldown state, and paid
            upgrades.
          </p>
        </div>
        <AccountDashboard kind="billing" />
      </section>
    </PageChrome>
  );
}
