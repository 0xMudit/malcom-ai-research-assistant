import type { Metadata } from "next";
import { PageChrome } from "@/components/PageChrome";
import { getPublicAppHealth } from "@/lib/health";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Status",
  description: "Malcom service status.",
};

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: "ok" | "warn" | "fail" }) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status${status}`]}`}>
      {status}
    </span>
  );
}

function statusText(status: "ok" | "warn" | "fail") {
  if (status === "ok") {
    return "Operational";
  }

  if (status === "warn") {
    return "Degraded";
  }

  return "Unavailable";
}

export default async function StatusPage() {
  const health = await getPublicAppHealth();

  return (
    <PageChrome>
      <section className={styles.content}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Status</span>
          <h1>Service Status</h1>
          <p>
            Last checked {new Date(health.checkedAt).toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "UTC",
            })}{" "}
            UTC.
          </p>
        </div>

        <div className={styles.statusGrid}>
          <article className={styles.statusCard}>
            <div>
              <h2>Application</h2>
              <StatusBadge status={health.components.app} />
            </div>
            <p>{statusText(health.components.app)}</p>
          </article>

          <article className={styles.statusCard}>
            <div>
              <h2>AI Responses</h2>
              <StatusBadge status={health.components.ai} />
            </div>
            <p>{statusText(health.components.ai)}</p>
          </article>

          <article className={styles.statusCard}>
            <div>
              <h2>Storage</h2>
              <StatusBadge status={health.components.storage} />
            </div>
            <p>{statusText(health.components.storage)}</p>
          </article>

          <article className={styles.statusCard}>
            <div>
              <h2>Billing</h2>
              <StatusBadge status={health.components.billing} />
            </div>
            <p>{statusText(health.components.billing)}</p>
          </article>
        </div>
      </section>
    </PageChrome>
  );
}
