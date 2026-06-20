"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { readApiJson } from "@/lib/api-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "@/app/app-pages.module.css";

type AuthPayload = {
  user?: (User & { identities?: unknown[] }) | null;
  session?: Session | null;
};

function getOAuthCallbackUrl() {
  return new URL("/auth/callback", window.location.origin).toString();
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const [formMode, setFormMode] = useState(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    supabaseRef.current = createSupabaseBrowserClient();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = supabaseRef.current;

    if (!supabase) {
      setStatus("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      if (formMode === "register") {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        });
        const payload = await readApiJson<AuthPayload>(
          response,
          "Account could not be created.",
        );

        if (!response.ok) {
          const errorMessage = payload.error || "Account could not be created.";

          if (/already|registered|exists/i.test(errorMessage)) {
            setFormMode("login");
            setPassword("");
            setStatus(
              "You are already registered. Enter your password to log in.",
            );
            return;
          }

          throw new Error(errorMessage);
        }

        const identities = Array.isArray(payload.user?.identities)
          ? payload.user.identities
          : null;

        if (!payload.session && identities && identities.length === 0) {
          setFormMode("login");
          setPassword("");
          setStatus(
            "You are already registered. Enter your password to log in.",
          );
          return;
        }

        if (!payload.session) {
          setStatus("Check your email to confirm the account, then log in.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          throw error;
        }
      }

      router.push("/new");
      router.refresh();
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Authentication failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function continueWithGoogle() {
    const supabase = supabaseRef.current;

    if (!supabase) {
      setStatus("Supabase is not configured.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Redirecting to Google...");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getOAuthCallbackUrl(),
        },
      });

      if (error) {
        throw error;
      }
    } catch (caughtError) {
      setStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Google sign-in failed.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.formCard}>
      <h2>{formMode === "register" ? "Create account" : "Log in"}</h2>
      <p className={styles.helperText}>
        {formMode === "register"
          ? "Save chats, sync documents, and continue research across devices."
          : "Access saved chats, account usage, profile memory, and billing."}
      </p>

      <button
        className={styles.oauthButton}
        type="button"
        onClick={continueWithGoogle}
        disabled={isSubmitting}
      >
        <Mail size={16} />
        <span>
          {formMode === "register"
            ? "Sign up with Google"
            : "Log in with Google"}
        </span>
      </button>

      <div className={styles.authDivider} aria-hidden="true">
        <span>or</span>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <label>
          <span>Email</span>
          <input
            required
            type="email"
            maxLength={180}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          <span>Password</span>
          <div className={styles.passwordField}>
            <input
              required
              type={passwordVisible ? "text" : "password"}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setPasswordVisible((current) => !current)}
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              title={passwordVisible ? "Hide password" : "Show password"}
            >
              {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        {status ? <p className={styles.statusText}>{status}</p> : null}

        <button className={styles.button} type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Working..."
            : formMode === "register"
              ? "Create account"
              : "Log in"}
        </button>
      </form>

      <p className={styles.helperText}>
        {formMode === "login" ? (
          <>
            New to Malcom? <Link href="/register">Create an account</Link>.
          </>
        ) : (
          <>
            Already have an account? <Link href="/login">Log in</Link>.
          </>
        )}
      </p>
    </section>
  );
}
