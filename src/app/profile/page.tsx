import type { Metadata } from "next";
import { AccountDashboard } from "@/components/AccountDashboard";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your Malcom profile, plan, usage, and workspace details.",
};

export default function ProfilePage() {
  return (
    <PageChrome>
      <section className={styles.content}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Profile</span>
          <h1>Your Malcom workspace</h1>
          <p>Manage account details, profile memory, usage, and saved research.</p>
        </div>
        <AccountDashboard kind="profile" />
      </section>
    </PageChrome>
  );
}
