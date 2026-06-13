import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Malcom to access saved chats, usage, and billing.",
};

export default function LoginPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.narrowContent}`}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Account</span>
          <h1>Log in to Malcom</h1>
          <p>Continue research across devices and manage your workspace.</p>
        </div>
        <AuthForm mode="login" />
      </section>
    </PageChrome>
  );
}
