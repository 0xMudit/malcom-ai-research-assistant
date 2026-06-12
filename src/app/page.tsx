"use client";

import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  Check,
  CircleUserRound,
  Copy,
  LogIn,
  MessageSquareText,
  MessageSquareHeart,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  SendHorizontal,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  FormEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./page.module.css";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
};

type StoredChat = {
  sessionId: string;
  messages: Message[];
};

type AppStats = {
  sessions: number;
  messages: number;
  feedback: number;
  averageRating: number;
  accessRequests: number;
  responseActions: number;
};

type ResponseReaction = "like" | "dislike";

type ResponseState = {
  reaction?: ResponseReaction;
  copied?: boolean;
  commenting?: boolean;
  comment?: string;
  status?: string;
};

const starterPrompts = [
  {
    title: "Research",
    prompt: "Build a research brief from these notes and identify the unknowns.",
  },
  {
    title: "Engineering",
    prompt: "Review this system design and call out failure modes.",
  },
  {
    title: "Analysis",
    prompt: "Compare these competing hypotheses and rank the evidence.",
  },
  {
    title: "Field Notes",
    prompt: "Turn these raw observations into an actionable report.",
  },
];

const initialMessages: Message[] = [];
const chatStorageKey = "malcom.chat.v2";
const startupAnimationMs = 1800;

function createMessageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <figure className={styles.codeBlock}>
      <figcaption>
        <span>{language}</span>
        <button type="button" onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}

function normalizeMarkdown(content: string) {
  return normalizeBrokenMathText(content)
    .replace(/\r\n/g, "\n")
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith("```")) {
        return segment;
      }

      return segment
        .replace(
          /\\\[([\s\S]*?)\\\]/g,
          (_, math: string) => `$$${normalizeMath(math)}$$`,
        )
        .replace(
          /\\\(([\s\S]*?)\\\)/g,
          (_, math: string) => `$${normalizeMath(math)}$`,
        )
        .replace(
          /(\${1,2})([\s\S]*?)\1/g,
          (match, delimiter: string, math: string) => {
            if (!math.trim()) {
              return match;
            }

            return `${delimiter}${normalizeMath(math)}${delimiter}`;
          },
        )
        .replace(/([^\n])(\s*#{1,6}\s+)/g, "$1\n\n$2")
        .replace(/([^\n])(\s*\|[^\n]+\|\s*\n\s*\|[\s:|.-]+\|)/g, "$1\n\n$2")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("")
    .trim();
}

function normalizeMath(math: string) {
  return math
    .replace(/\\bar_\{([^}]+)\}/g, "\\bar{$1}")
    .replace(/\bSE\b/g, "\\mathrm{SE}")
    .replace(
      /((?:\\(?:hat|bar|tilde|vec)\{[A-Za-z]\})|[A-Za-z])\{([A-Za-z0-9+\-|,:\s]+)\}/g,
      "$1_{$2}",
    );
}

function normalizeBrokenMathText(content: string) {
  return content
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(
      /\(\s*H\s*\n\s*0\s*H\s*0\s*:\s*([^)]+)\)/g,
      "($H_0$: $1)",
    )
    .replace(
      /\bZ\s*=\s*(\\frac[\s\S]*?\\approx\s*-?\d+(?:\.\d+)?)\s+Where\b/g,
      "\n\n$$Z = $1$$\n\nWhere",
    )
    .replace(
      /S\s*\n\s*E\s*\n\s*SE\s*\(Standard Error\)/g,
      "$SE$ (Standard Error)",
    )
    .replace(
      /s\s*\n\s*d\s*\n\s*i\s*\n\s*f\s*\n\s*f\s*≈\s*(-?\d+(?:\.\d+)?)/g,
      "$s_{diff} \\approx $1$",
    )
    .replace(/s\s+diff\s*≈\s*(-?\d+(?:\.\d+)?)/g, "$s_{diff} \\approx $1$");
}

const markdownComponents: Components = {
  code({ className, children }) {
    const language = /language-(\w+)/.exec(className || "")?.[1];

    if (language) {
      return (
        <CodeBlock
          code={String(children).replace(/\n$/, "")}
          language={language}
        />
      );
    }

    return <code>{children}</code>;
  },
  table({ children }) {
    return (
      <div className={styles.tableScroll}>
        <table>{children}</table>
      </div>
    );
  },
};

function MessageContent({ content }: { content: string }) {
  const markdown = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <div className={styles.messageContent}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkMath, remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function loadStoredChat(): StoredChat {
  if (typeof window === "undefined") {
    return { sessionId: createMessageId(), messages: initialMessages };
  }

  try {
    const stored = window.localStorage.getItem(chatStorageKey);

    if (!stored) {
      return { sessionId: createMessageId(), messages: initialMessages };
    }

    const parsed = JSON.parse(stored) as Partial<StoredChat>;

    if (!Array.isArray(parsed.messages) || typeof parsed.sessionId !== "string") {
      return { sessionId: createMessageId(), messages: initialMessages };
    }

    return {
      sessionId: parsed.sessionId,
      messages: parsed.messages.filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.id === "string" &&
          typeof message.content === "string",
      ),
    };
  } catch {
    return { sessionId: createMessageId(), messages: initialMessages };
  }
}

function MalcomAvatar({ active = false }: { active?: boolean }) {
  return (
    <div
      className={`${styles.malcomAvatar} ${active ? styles.avatarActive : ""}`}
      aria-hidden="true"
    >
      <BrainCircuit size={18} />
    </div>
  );
}

function UserAvatar() {
  return (
    <div className={styles.userAvatar} aria-hidden="true">
      <CircleUserRound size={18} />
    </div>
  );
}

const MessageItem = memo(function MessageItem({
  message,
  responseState,
  onCopy,
  onReaction,
  onRegenerate,
  onToggleComment,
  onCommentChange,
  onSubmitComment,
}: {
  message: Message;
  responseState?: ResponseState;
  onCopy(id: string, content: string): void;
  onReaction(id: string, reaction: ResponseReaction): void;
  onRegenerate(id: string): void;
  onToggleComment(id: string): void;
  onCommentChange(id: string, comment: string): void;
  onSubmitComment(id: string): void;
}) {
  return (
    <article className={`${styles.message} ${styles[message.role]}`}>
      {message.role === "assistant" ? <MalcomAvatar /> : <UserAvatar />}
      <div className={styles.messageBody}>
        <span>{message.role === "assistant" ? "Malcom" : "You"}</span>
        <MessageContent content={message.content} />
        {message.role === "assistant" ? (
          <div className={styles.responseTools}>
            <div className={styles.responseActions} aria-label="Response actions">
              <button
                type="button"
                onClick={() => onCopy(message.id, message.content)}
                aria-label="Copy response"
                title="Copy"
              >
                {responseState?.copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                className={
                  responseState?.reaction === "like" ? styles.actionActive : ""
                }
                onClick={() => onReaction(message.id, "like")}
                aria-label="Like response"
                title="Like"
              >
                <ThumbsUp size={15} />
              </button>
              <button
                type="button"
                className={
                  responseState?.reaction === "dislike" ? styles.actionActive : ""
                }
                onClick={() => onReaction(message.id, "dislike")}
                aria-label="Dislike response"
                title="Dislike"
              >
                <ThumbsDown size={15} />
              </button>
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                aria-label="Regenerate response"
                title="Regenerate"
              >
                <RefreshCcw size={15} />
              </button>
              <button
                type="button"
                className={responseState?.commenting ? styles.actionActive : ""}
                onClick={() => onToggleComment(message.id)}
                aria-label="Comment on response"
                title="Comment"
              >
                <MessageSquareText size={15} />
              </button>
            </div>

            {responseState?.commenting ? (
              <div className={styles.responseComment}>
                <textarea
                  value={responseState.comment || ""}
                  onChange={(event) =>
                    onCommentChange(message.id, event.target.value)
                  }
                  placeholder="Write a comment on this response..."
                  rows={3}
                />
                <button type="button" onClick={() => onSubmitComment(message.id)}>
                  Save comment
                </button>
              </div>
            ) : null}

            {responseState?.status ? (
              <p className={styles.responseStatus}>{responseState.status}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
});

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sessionId, setSessionId] = useState(() => createMessageId());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isStarting, setIsStarting] = useState(true);
  const [hasLoadedStoredChat, setHasLoadedStoredChat] = useState(false);
  const [stats, setStats] = useState<AppStats>({
    sessions: 0,
    messages: 0,
    feedback: 0,
    averageRating: 0,
    accessRequests: 0,
    responseActions: 0,
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackSuggestion, setFeedbackSuggestion] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessName, setAccessName] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessStatus, setAccessStatus] = useState("");
  const [isSubmittingAccess, setIsSubmittingAccess] = useState(false);
  const [responseStates, setResponseStates] = useState<
    Record<string, ResponseState>
  >({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const visiblePrompt = useMemo(
    () => messages.length === 0 && input.trim().length === 0,
    [input, messages.length],
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      const stored = loadStoredChat();
      setSessionId(stored.sessionId);
      setMessages(stored.messages);
      setHasLoadedStoredChat(true);
    }, 0);

    const startupTimer = window.setTimeout(
      () => setIsStarting(false),
      startupAnimationMs,
    );

    return () => {
      window.clearTimeout(loadTimer);
      window.clearTimeout(startupTimer);
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredChat) {
      return;
    }

    window.localStorage.setItem(
      chatStorageKey,
      JSON.stringify({ sessionId, messages }),
    );
  }, [hasLoadedStoredChat, messages, sessionId]);

  useEffect(() => {
    void refreshStats();
  }, []);

  useEffect(() => {
    const thread = threadRef.current;

    if (!thread || messages.length === 0) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
  }, [error, isSending, messages]);

  async function refreshStats() {
    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      const data = (await response.json()) as AppStats;

      if (response.ok) {
        setStats(data);
      }
    } catch {
      // Stats are secondary UI; chat should keep working if this fails.
    }
  }

  async function sendMessage(nextInput = input, baseMessages = messages) {
    const prompt = nextInput.trim();

    if (!prompt || isSending) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;

    const userMessage: Message = {
      id: createMessageId(),
      role: "user",
      content: prompt,
    };

    const pendingMessages = [...baseMessages, userMessage];
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
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          messages: pendingMessages.map(({ id, role, content }) => ({
            id,
            role,
            content,
          })),
        }),
      });

      const data = (await response.json()) as {
        id?: string;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Malcom could not reach the intelligence engine.");
      }

      if (requestToken !== requestTokenRef.current || controller.signal.aborted) {
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: data.id || createMessageId(),
          role: "assistant",
          content: data.message || "No response was returned by the model.",
        },
      ]);
      playResponsePing();
      void refreshStats();
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unexpected intelligence engine error.";
      if (requestToken === requestTokenRef.current) {
        setError(message);
      }
    } finally {
      if (requestToken === requestTokenRef.current) {
        setIsSending(false);
        abortRef.current = null;
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function startNewChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    requestTokenRef.current += 1;
    setIsSending(false);
    const nextSessionId = createMessageId();
    setSessionId(nextSessionId);
    setMessages(initialMessages);
    setResponseStates({});
    window.localStorage.removeItem(chatStorageKey);
    setInput("");
    setError("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function patchResponseState(id: string, patch: ResponseState) {
    setResponseStates((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  async function saveResponseAction(
    messageId: string,
    reaction: ResponseReaction | "comment",
    comment = "",
  ) {
    const response = await fetch("/api/response-feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageId, reaction, comment }),
    });

    if (!response.ok) {
      throw new Error("Response action was not saved.");
    }
  }

  function playResponsePing() {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextClass = window.AudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext =
      audioContextRef.current || new AudioContextClass({ latencyHint: "interactive" });
    audioContextRef.current = audioContext;

    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  }

  function copyWithFallback(content: string) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(content);
    }

    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    return Promise.resolve();
  }

  async function copyResponse(id: string, content: string) {
    try {
      await copyWithFallback(content);
      patchResponseState(id, { copied: true, status: "Copied" });
      window.setTimeout(
        () => patchResponseState(id, { copied: false, status: "" }),
        1300,
      );
    } catch {
      patchResponseState(id, { status: "Copy failed" });
    }
  }

  async function reactToResponse(id: string, reaction: ResponseReaction) {
    patchResponseState(id, { reaction, status: "Saved" });

    try {
      await saveResponseAction(id, reaction);
    } catch {
      patchResponseState(id, { status: "Could not save" });
      return;
    }

    window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
  }

  function toggleResponseComment(id: string) {
    setResponseStates((current) => ({
      ...current,
      [id]: {
        ...current[id],
        commenting: !current[id]?.commenting,
        status: "",
      },
    }));
  }

  function changeResponseComment(id: string, comment: string) {
    patchResponseState(id, { comment });
  }

  async function submitResponseComment(id: string) {
    const comment = responseStates[id]?.comment?.trim() || "";

    if (!comment) {
      patchResponseState(id, { status: "Write a comment first" });
      return;
    }

    patchResponseState(id, { status: "Saving..." });

    try {
      await saveResponseAction(id, "comment", comment);
      patchResponseState(id, {
        comment: "",
        commenting: false,
        status: "Comment saved",
      });
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save comment" });
    }
  }

  function regenerateResponse(id: string) {
    const responseIndex = messages.findIndex((message) => message.id === id);

    if (responseIndex < 1 || isSending) {
      return;
    }

    const priorMessages = messages.slice(0, responseIndex);
    const previousUser = [...priorMessages]
      .reverse()
      .find((message) => message.role === "user");

    if (!previousUser) {
      return;
    }

    setMessages(priorMessages);
    void sendMessage(previousUser.content, priorMessages.slice(0, -1));
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackStatus("");
    setIsSubmittingFeedback(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: feedbackName,
          email: feedbackEmail,
          rating: feedbackRating,
          suggestion: feedbackSuggestion,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Feedback was not saved.");
      }

      setFeedbackStatus("Feedback saved.");
      setFeedbackName("");
      setFeedbackEmail("");
      setFeedbackRating(5);
      setFeedbackSuggestion("");
      void refreshStats();
      window.setTimeout(() => setFeedbackOpen(false), 700);
    } catch (caughtError) {
      setFeedbackStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Feedback was not saved.",
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function submitAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessStatus("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail.trim())) {
      setAccessStatus("Enter a valid email address.");
      return;
    }

    setIsSubmittingAccess(true);

    try {
      const response = await fetch("/api/access-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: accessName,
          email: accessEmail,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Access request was not saved.");
      }

      setAccessStatus("Request saved. The admin can review it now.");
      setAccessName("");
      setAccessEmail("");
      void refreshStats();
      window.setTimeout(() => setAccessOpen(false), 900);
    } catch (caughtError) {
      setAccessStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Access request was not saved.",
      );
    } finally {
      setIsSubmittingAccess(false);
    }
  }

  return (
    <main
      className={`${styles.shell} ${
        sidebarCollapsed ? styles.shellCollapsed : ""
      }`}
    >
      {isStarting ? (
        <section className={styles.startup} aria-label="Starting Malcom">
          <div className={styles.startupFrame}>
            <div className={styles.startupLogo} aria-hidden="true">
              <BrainCircuit size={38} />
            </div>
            <div className={styles.startupCopy}>
              <p>Welcome to Malcom</p>
              <span>Research command is ready</span>
            </div>
          </div>
        </section>
      ) : null}

      <aside className={styles.sidebar} aria-label="Conversation navigation">
        <div className={styles.brand}>
          <MalcomAvatar active />
          <div className={styles.brandText}>
            <h1>Malcom</h1>
            <p className={styles.developerCredit}>
              <span>Developed by</span>
              <strong>Muditya Raghav</strong>
              <a href="mailto:0xMudit@gmail.com">0xMudit@gmail.com</a>
            </p>
          </div>
        </div>

        <button
          className={styles.iconButton}
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>

        <button className={styles.primaryButton} type="button" onClick={startNewChat}>
          <Plus size={16} />
          <span>New chat</span>
        </button>

        <button
          className={styles.loginButton}
          type="button"
          onClick={() => setAccessOpen(true)}
          aria-label="Request login access"
          title="Login"
        >
          <LogIn size={16} />
          <span>Login</span>
        </button>

        <button
          className={styles.feedbackButton}
          type="button"
          onClick={() => setFeedbackOpen(true)}
          aria-label="Open feedback"
          title="Feedback"
        >
          <MessageSquareHeart size={16} />
          <span>Feedback</span>
        </button>

        <div className={styles.statsBar} aria-label="Workspace stats">
          <div>
            <BarChart3 size={15} />
            <span>Stats</span>
          </div>
          <dl>
            <div>
              <dt>Chats</dt>
              <dd>{stats.sessions}</dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>{stats.messages}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd>{stats.accessRequests}</dd>
            </div>
            <div>
              <dt>Rating</dt>
              <dd>{stats.averageRating.toFixed(1)}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <section className={styles.chat}>
        <div className={styles.thread} ref={threadRef} aria-live="polite">
          {visiblePrompt ? (
            <section className={styles.emptyState}>
              <div className={styles.emptyMark}>
                <BrainCircuit size={28} />
              </div>
              <h2>What should Malcom help with?</h2>
              <p>
                Built for scientists, engineers, intelligence teams, and researchers
                who need rigorous synthesis, technical review, and operational clarity.
              </p>
              <div className={styles.suggestions}>
                {starterPrompts.map((item) => (
                  <button
                    key={item.prompt}
                    type="button"
                    onClick={() => void sendMessage(item.prompt)}
                  >
                    <span>{item.title}</span>
                    {item.prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {messages.map((message) => (
            <MessageItem
              key={message.id}
              message={message}
              responseState={responseStates[message.id]}
              onCopy={copyResponse}
              onReaction={reactToResponse}
              onRegenerate={regenerateResponse}
              onToggleComment={toggleResponseComment}
              onCommentChange={changeResponseComment}
              onSubmitComment={submitResponseComment}
            />
          ))}

          {isSending ? (
            <article className={`${styles.message} ${styles.assistant}`}>
              <MalcomAvatar active />
              <div className={styles.messageBody}>
                <span>Malcom</span>
                <div className={styles.thinking} aria-label="Malcom is working">
                  <strong>Malcom is working</strong>
                  <div className={styles.fighterLoader} aria-hidden="true" />
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {error ? (
            <p className={styles.error}>
              <AlertCircle size={16} />
              {error}
            </p>
          ) : null}

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
                  void sendMessage();
                }
              }}
              rows={1}
            />
            <button type="submit" disabled={isSending || !input.trim()}>
              <SendHorizontal size={17} />
              <span>{isSending ? "Sending" : "Send"}</span>
            </button>
          </form>
        </div>
      </section>

      {feedbackOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setFeedbackOpen(false);
            }
          }}
        >
          <section
            className={styles.feedbackDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Feedback</p>
                <h2 id="feedback-title">Help improve Malcom</h2>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackOpen(false)}
                aria-label="Close feedback"
              >
                <X size={17} />
              </button>
            </div>

            <form className={styles.feedbackForm} onSubmit={submitFeedback}>
              <label>
                <span>Name</span>
                <input
                  required
                  maxLength={80}
                  value={feedbackName}
                  onChange={(event) => setFeedbackName(event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  required
                  type="email"
                  maxLength={180}
                  value={feedbackEmail}
                  onChange={(event) => setFeedbackEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <fieldset className={styles.ratingField}>
                <legend>Rating</legend>
                <div>
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      className={
                        rating <= feedbackRating ? styles.ratingActive : ""
                      }
                      onClick={() => setFeedbackRating(rating)}
                      aria-label={`Rate ${rating} out of 5`}
                    >
                      <Star size={18} />
                    </button>
                  ))}
                </div>
              </fieldset>

              <label>
                <span>Suggestion</span>
                <textarea
                  required
                  maxLength={2000}
                  value={feedbackSuggestion}
                  onChange={(event) =>
                    setFeedbackSuggestion(event.target.value)
                  }
                  placeholder="What should be better?"
                  rows={5}
                />
              </label>

              {feedbackStatus ? (
                <p className={styles.feedbackStatus}>{feedbackStatus}</p>
              ) : null}

              <button type="submit" disabled={isSubmittingFeedback}>
                <Sparkles size={16} />
                {isSubmittingFeedback ? "Saving" : "Submit feedback"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {accessOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAccessOpen(false);
            }
          }}
        >
          <section
            className={styles.feedbackDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Login</p>
                <h2 id="access-title">Request access</h2>
              </div>
              <button
                type="button"
                onClick={() => setAccessOpen(false)}
                aria-label="Close access request"
              >
                <X size={17} />
              </button>
            </div>

            <form className={styles.feedbackForm} onSubmit={submitAccessRequest}>
              <label>
                <span>Name</span>
                <input
                  required
                  maxLength={80}
                  value={accessName}
                  onChange={(event) => setAccessName(event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  required
                  type="email"
                  maxLength={180}
                  value={accessEmail}
                  onChange={(event) => setAccessEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              {accessStatus ? (
                <p className={styles.feedbackStatus}>{accessStatus}</p>
              ) : null}

              <button type="submit" disabled={isSubmittingAccess}>
                {isSubmittingAccess ? "Sending..." : "Request access"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
