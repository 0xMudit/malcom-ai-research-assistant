"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
};

const starterPrompts = [
  "Draft a crisp launch plan for Malcom.",
  "Explain this model setup in simple terms.",
  "Help me debug a local inference error.",
];

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "I am Malcom. Connect your local model server, then ask anything from this workspace.",
  },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const visiblePrompt = useMemo(
    () => messages.length <= 1 && input.trim().length === 0,
    [input, messages.length],
  );

  async function sendMessage(nextInput = input) {
    const prompt = nextInput.trim();

    if (!prompt || isSending) {
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };

    const pendingMessages = [...messages, userMessage];
    setMessages(pendingMessages);
    setInput("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: pendingMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Malcom could not reach the local model.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.message || "No response was returned by the model.",
        },
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected local model error.";
      setError(message);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Conversation navigation">
        <div className={styles.brand}>
          <div className={styles.mark}>M</div>
          <div>
            <h1>Malcom</h1>
            <p>Local AI workspace</p>
          </div>
        </div>

        <button
          className={styles.newChat}
          type="button"
          onClick={() => {
            setMessages(initialMessages);
            setInput("");
            setError("");
          }}
        >
          <span aria-hidden="true">+</span>
          New chat
        </button>

        <div className={styles.modelPanel}>
          <span className={styles.panelLabel}>Model</span>
          <strong>SmolLM2 135M</strong>
          <p>Fast local testing runtime</p>
        </div>

        <div className={styles.statusBlock}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>Local endpoint</span>
          <code>localhost:1234</code>
        </div>
      </aside>

      <section className={styles.chat}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.eyebrow}>Private local chat</span>
            <h2>Ask Malcom</h2>
          </div>
          <div className={styles.pill}>Dark red</div>
        </header>

        <div className={styles.thread} aria-live="polite">
          {messages.map((message) => (
            <article
              className={`${styles.message} ${styles[message.role]}`}
              key={message.id}
            >
              <div className={styles.avatar}>
                {message.role === "assistant" ? "M" : "U"}
              </div>
              <div className={styles.bubble}>
                <span>{message.role === "assistant" ? "Malcom" : "You"}</span>
                <p>{message.content}</p>
              </div>
            </article>
          ))}

          {isSending ? (
            <article className={`${styles.message} ${styles.assistant}`}>
              <div className={styles.avatar}>M</div>
              <div className={styles.bubble}>
                <span>Malcom</span>
                <div className={styles.typing} aria-label="Malcom is thinking">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {visiblePrompt ? (
            <div className={styles.suggestions}>
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <form className={styles.composer} onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              aria-label="Message Malcom"
              placeholder="Message Malcom..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
            />
            <button type="submit" disabled={isSending || !input.trim()}>
              {isSending ? "Sending" : "Send"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
