import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { PageChrome } from "@/components/PageChrome";
import styles from "@/app/app-pages.module.css";

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Create a free Malcom account to save chats and continue research across devices.",
};

export default function RegisterPage() {
  return (
    <PageChrome>
      <section className={`${styles.content} ${styles.narrowContent}`}>
        <div className={styles.hero}>
          <span className={styles.eyebrow}>Free account</span>
          <h1>Create your Malcom account</h1>
          <p>Save chats, sync documents, and keep a consistent research workspace.</p>
        </div>
        <AuthForm mode="register" />
      </section>
    </PageChrome>
  );
}
