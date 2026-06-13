"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "@/app/app-pages.module.css";

type AccountUsage = {
  plan: "free" | "pro" | "enterprise";
  messagesUsed: number;
  messagesLimit: number | null;
  responsesRemaining: number | null;
  cooldownUntil: string | null;
  cooldownSecondsRemaining: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  isLimited: boolean;
};

type UserProfile = {
  display_name: string;
  memory: string;
};

type SavedSession = {
  id: string;
  title: string;
};

type StarredResponse = {
  id: string;
};

type DocumentResource = {
  id: string;
};

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${Math.max(1, minutes)}m`;
  }

  return `${hours}h ${minutes}m`;
}

function readablePlan(usage: AccountUsage | null) {
  if (usage?.plan === "enterprise") {
    return "Enterprise";
  }

  if (usage?.plan === "pro") {
    return "Pro";
  }

  return "Free";
}

export function AccountDashboard({
  kind,
}: {
  kind: "profile" | "settings" | "billing";
}) {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [profile, setProfile] = useState<UserProfile>({
    display_name: "",
    memory: "",
  });
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [starred, setStarred] = useState<StarredResponse[]>([]);
  const [documents, setDocuments] = useState<DocumentResource[]>([]);
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const authHeaders = useCallback(
    (token = accessToken): Record<string, string> =>
      token ? { Authorization: `Bearer ${token}` } : {},
    [accessToken],
  );

  const loadAccount = useCallback(async (token = accessToken) => {
    setStatus("");

    try {
      const [profileResponse, usageResponse, chatsResponse, starredResponse, docsResponse] =
        await Promise.all([
          fetch("/api/user/profile", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/user/usage", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/user/chats", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/user/starred-responses", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
          fetch("/api/documents", {
            cache: "no-store",
            headers: authHeaders(token),
          }),
        ]);

      if (profileResponse.ok) {
        const data = (await profileResponse.json()) as { profile?: UserProfile };
        setProfile(data.profile || { display_name: "", memory: "" });
      }

      if (usageResponse.ok) {
        const data = (await usageResponse.json()) as { usage?: AccountUsage };
        setUsage(data.usage || null);
      }

      if (chatsResponse.ok) {
        const data = (await chatsResponse.json()) as { sessions?: SavedSession[] };
        setSessions(data.sessions || []);
      }

      if (starredResponse.ok) {
        const data = (await starredResponse.json()) as {
          starred?: StarredResponse[];
        };
        setStarred(data.starred || []);
      }

      if (docsResponse.ok) {
        const data = (await docsResponse.json()) as {
          documents?: DocumentResource[];
        };
        setDocuments(data.documents || []);
      }
    } catch {
      setStatus("Could not load account details.");
    }
  }, [accessToken, authHeaders]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setAccessToken(data.session?.access_token || "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAccessToken(session?.access_token || "");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadAccount(accessToken);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [accessToken, loadAccount]);

  async function saveProfile() {
    if (!accessToken) {
      return;
    }

    setIsWorking(true);
    setStatus("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          displayName: profile.display_name,
          memory: profile.memory,
        }),
      });

      if (!response.ok) {
        throw new Error("Profile was not saved.");
      }

      setStatus("Profile saved.");
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Profile was not saved.",
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function signOut() {
    await supabaseRef.current?.auth.signOut();
    setUser(null);
    setAccessToken("");
    router.push("/");
    router.refresh();
  }

  async function startCheckout(plan: "pro" | "enterprise") {
    if (!accessToken) {
      setStatus("Log in before upgrading.");
      return;
    }

    setIsWorking(true);
    setStatus("");

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Checkout could not be started.");
      }

      window.location.href = data.url;
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Checkout could not be started.",
      );
      setIsWorking(false);
    }
  }

  if (!user) {
    return (
      <div className={styles.notice}>
        <span className={styles.badge}>Guest</span>
        <h2>Use Malcom without an account, or sign in to manage this page.</h2>
        <p className={styles.helperText}>
          Guest mode gives 10 responses on this device. Create a free account to
          save chats and continue across devices.
        </p>
        <div className={styles.buttonRow}>
          <Link className={styles.button} href="/register">
            Create account
          </Link>
          <Link className={styles.secondaryButton} href="/login">
            Log in
          </Link>
          <Link className={styles.secondaryButton} href="/">
            Try without an account
          </Link>
        </div>
      </div>
    );
  }

  const hasMeaningfulStats =
    (usage?.messagesUsed || 0) > 0 ||
    sessions.length > 0 ||
    documents.length > 0 ||
    starred.length > 0;

  if (kind === "billing") {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.badge}>{readablePlan(usage)}</span>
              <h2>Current plan</h2>
            </div>
          </div>
          <p>
            {usage?.plan === "enterprise"
              ? "Your account is on Enterprise. Highest limits are active while the Stripe subscription is active."
              : usage?.plan === "pro"
                ? "Your account is on Pro. Higher limits are active while the Stripe subscription is active."
              : "Free accounts include 100 messages per window. After that, a 5-hour cooldown starts."}
          </p>
          {usage?.plan === "free" || !usage ? (
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Messages used</span>
                <strong>{usage?.messagesUsed ?? 0}</strong>
              </div>
              <div className={styles.metric}>
                <span>Remaining</span>
                <strong>{usage?.responsesRemaining ?? 100}</strong>
              </div>
              <div className={styles.metric}>
                <span>Cooldown</span>
                <strong>
                  {usage?.cooldownSecondsRemaining
                    ? formatDuration(usage.cooldownSecondsRemaining)
                    : "Ready"}
                </strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.card}>
          <span className={styles.badge}>Free</span>
          <h2>$0</h2>
          <p>
            100 messages per usage window, saved chats, document uploads, and
            profile memory for signed-in accounts.
          </p>
        </section>

        <section className={styles.card}>
          <span className={styles.badge}>Pro</span>
          <h2>$999</h2>
          <p>
            Higher limits for serious research sessions. Checkout uses Stripe
            test or live mode based on your environment keys.
          </p>
          {status ? <p className={styles.statusText}>{status}</p> : null}
          <button
            className={styles.button}
            type="button"
            onClick={() => void startCheckout("pro")}
            disabled={isWorking || usage?.plan === "pro" || usage?.plan === "enterprise"}
          >
            {usage?.plan === "pro"
              ? "Pro active"
              : usage?.plan === "enterprise"
                ? "Enterprise active"
                : "Upgrade to Pro"}
          </button>
        </section>

        <section className={styles.card}>
          <span className={styles.badge}>Enterprise</span>
          <h2>$10000</h2>
          <p>
            Highest limits for larger teams and intensive workloads, billed
            through the configured Enterprise Stripe price.
          </p>
          <button
            className={styles.button}
            type="button"
            onClick={() => void startCheckout("enterprise")}
            disabled={isWorking || usage?.plan === "enterprise"}
          >
            {usage?.plan === "enterprise"
              ? "Enterprise active"
              : "Upgrade to Enterprise"}
          </button>
        </section>
      </div>
    );
  }

  if (kind === "settings") {
    return (
      <div className={styles.dashboardGrid}>
        <section id="profile" className={styles.formCard}>
          <span className={styles.badge}>Profile</span>
          <h2>Account profile</h2>
          <p className={styles.helperText}>{user.email}</p>
          <div className={styles.form}>
            <label>
              <span>Display name</span>
              <input
                value={profile.display_name}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    display_name: event.target.value,
                  }))
                }
                placeholder="Name Malcom should use"
              />
            </label>
            <label>
              <span>Profile memory</span>
              <textarea
                value={profile.memory}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    memory: event.target.value,
                  }))
                }
                placeholder="Preferences, recurring context, response style, or work focus"
                rows={7}
              />
            </label>
            {status ? <p className={styles.statusText}>{status}</p> : null}
            <div className={styles.buttonRow}>
              <button
                className={styles.button}
                type="button"
                onClick={() => void saveProfile()}
                disabled={isWorking}
              >
                Save profile
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                onClick={() => void signOut()}
              >
                Log out
              </button>
            </div>
          </div>
        </section>

        <section id="settings" className={styles.card}>
          <span className={styles.badge}>Settings</span>
          <h2>Usage</h2>
          <p>
            {usage?.plan === "pro"
              ? "Pro usage is active."
              : usage?.plan === "enterprise"
                ? "Enterprise usage is active."
              : `${usage?.messagesUsed ?? 0}/${usage?.messagesLimit ?? 100} free messages used.`}
          </p>
          {usage?.cooldownSecondsRemaining ? (
            <p>Cooldown ends in {formatDuration(usage.cooldownSecondsRemaining)}.</p>
          ) : null}
          {hasMeaningfulStats ? (
            <div className={styles.metricGrid}>
              <div className={styles.metric}>
                <span>Saved chats</span>
                <strong>{sessions.length}</strong>
              </div>
              <div className={styles.metric}>
                <span>Documents</span>
                <strong>{documents.length}</strong>
              </div>
              <div className={styles.metric}>
                <span>Starred</span>
                <strong>{starred.length}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section id="billing" className={styles.card}>
          <span className={styles.badge}>Billing</span>
          <h2>Subscription</h2>
          <p>
            Current plan: <strong>{readablePlan(usage)}</strong>
          </p>
          <ul>
            <li>Free - $0</li>
            <li>Pro - $999</li>
            <li>Enterprise - $10000</li>
          </ul>
          <div className={styles.buttonRow}>
            <button
              className={styles.button}
              type="button"
              onClick={() => void startCheckout("pro")}
              disabled={
                isWorking ||
                usage?.plan === "pro" ||
                usage?.plan === "enterprise"
              }
            >
              {usage?.plan === "pro"
                ? "Pro active"
                : usage?.plan === "enterprise"
                  ? "Enterprise active"
                  : "Upgrade to Pro"}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void startCheckout("enterprise")}
              disabled={isWorking || usage?.plan === "enterprise"}
            >
              {usage?.plan === "enterprise"
                ? "Enterprise active"
                : "Upgrade to Enterprise"}
            </button>
          </div>
        </section>

        <section id="privacy" className={styles.card}>
          <h2>Privacy and data</h2>
          <p>
            Guest chats are stored on this device. Uploaded files are used as
            context for the conversation and, for signed-in users, listed in the
            document library.
          </p>
          <div className={styles.buttonRow}>
            <Link className={styles.secondaryButton} href="/privacy">
              Privacy
            </Link>
            <Link className={styles.secondaryButton} href="/terms">
              Terms
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.formCard}>
        <span className={styles.badge}>{readablePlan(usage)}</span>
        <h2>Profile</h2>
        <p className={styles.helperText}>{user.email}</p>
        <div className={styles.form}>
          <label>
            <span>Display name</span>
            <input
              value={profile.display_name}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  display_name: event.target.value,
                }))
              }
              placeholder="Name Malcom should use"
            />
          </label>
          <label>
            <span>Profile memory</span>
            <textarea
              value={profile.memory}
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  memory: event.target.value,
                }))
              }
              placeholder="Preferences, recurring context, response style, or work focus"
              rows={7}
            />
          </label>
          {status ? <p className={styles.statusText}>{status}</p> : null}
          <div className={styles.buttonRow}>
            <button
              className={styles.button}
              type="button"
              onClick={() => void saveProfile()}
              disabled={isWorking}
            >
              Save profile
            </button>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={() => void signOut()}
            >
              Log out
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Workspace</h2>
        <p>
          Current plan: <strong>{readablePlan(usage)}</strong>
        </p>
        {hasMeaningfulStats ? (
          <div className={styles.metricGrid}>
            <div className={styles.metric}>
              <span>Messages used</span>
              <strong>{usage?.messagesUsed ?? 0}</strong>
            </div>
            <div className={styles.metric}>
              <span>Saved chats</span>
              <strong>{sessions.length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Documents</span>
              <strong>{documents.length}</strong>
            </div>
            <div className={styles.metric}>
              <span>Starred</span>
              <strong>{starred.length}</strong>
            </div>
          </div>
        ) : (
          <p>Usage and workspace stats will appear after your first request.</p>
        )}
        <div className={styles.buttonRow}>
          <Link className={styles.secondaryButton} href="/settings">
            Settings
          </Link>
          <Link className={styles.secondaryButton} href="/billing">
            Billing
          </Link>
        </div>
      </section>
    </div>
  );
}
