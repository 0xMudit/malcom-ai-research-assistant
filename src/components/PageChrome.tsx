import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/app/app-pages.module.css";

export function PageChrome({ children }: { children: ReactNode }) {
  return (
    <main className={styles.pageShell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/new">
          <span className={styles.brandMark}>
            <BrainCircuit size={18} />
            <small>Beta</small>
          </span>
          <span>Malcom</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/new">Chat</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>
      {children}
      <footer className={styles.footer}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/status">Status</Link>
        <Link href="/changelog">Changelog</Link>
      </footer>
    </main>
  );
}
