import type { Metadata } from "next";
import Link from "next/link";
import { AccountDashboard } from "@/components/AccountDashboard";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Settings",
  description: "Review Malcom account, usage, subscription, and privacy settings.",
};

export default function SettingsPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.dashboardContent}`}>
        <header className={styles.dashboardHero}>
          <div>
            <span className={styles.eyebrow}>Settings</span>
            <h1>Workspace dashboard</h1>
            <p>Manage account, usage, billing, and privacy from one place.</p>
          </div>
          <Link className={styles.secondaryButton} href="/new">
            Back to chat
          </Link>
        </header>

        <div className={styles.dashboardLayout}>
          <aside className={styles.settingsSidebar} aria-label="Settings navigation">
            <div>
              <span className={styles.eyebrow}>Dashboard</span>
              <h2>Account</h2>
            </div>
            <nav>
              <a href="#profile">Profile</a>
              <a href="#settings">Settings</a>
              <a href="#billing">Billing</a>
              <a href="#privacy">Privacy</a>
            </nav>
          </aside>

          <div className={styles.dashboardMain}>
            <AccountDashboard kind="settings" />
          </div>
        </div>
      </section>
    </PageChrome>
  );
}
