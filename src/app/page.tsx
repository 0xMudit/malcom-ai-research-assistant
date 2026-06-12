"use client";

import {
  AlertCircle,
  BarChart3,
  BookMarked,
  BrainCircuit,
  Check,
  CircleUserRound,
  Copy,
  Edit3,
  HardDrive,
  LogIn,
  MessageSquareText,
  MessageSquareHeart,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  RefreshCcw,
  Search,
  SendHorizontal,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
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
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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

type SavedSession = {
  id: string;
  title: string;
  folder?: string | null;
  tags?: string | null;
  pinned?: number | boolean | null;
  created_at: string;
  updated_at: string;
};

type StarredResponse = {
  id: string;
  message_id: string;
  session_id: string;
  content: string;
  created_at: string;
};

type UserProfile = {
  display_name: string;
  memory: string;
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

type StarterPrompt = {
  title: string;
  prompt: string;
};

const starterPromptPool: StarterPrompt[] = [
  {
    title: "Unhinged summary",
    prompt: "Explain this like a smart friend who is tired of corporate nonsense.",
  },
  {
    title: "Reality check",
    prompt: "Tell me what I am missing, what could go wrong, and what actually matters.",
  },
  {
    title: "Main character plan",
    prompt: "Turn this messy goal into a focused 7-day plan I can actually follow.",
  },
  {
    title: "Hot take audit",
    prompt: "Give me the strongest argument for and against this idea, then pick a side.",
  },
  {
    title: "No-fluff roast",
    prompt: "Critique this brutally but usefully, then tell me exactly how to fix it.",
  },
  {
    title: "DM draft",
    prompt: "Write a confident, low-cringe message for this situation.",
  },
  {
    title: "Brain dump",
    prompt: "Turn my chaotic notes into a clean answer with action items.",
  },
  {
    title: "Study mode",
    prompt: "Teach me this topic fast using examples, memory hooks, and a quick quiz.",
  },
  {
    title: "Career move",
    prompt: "Help me make this career decision with risks, upside, and next steps.",
  },
  {
    title: "Vibe check",
    prompt: "Read this situation and tell me what the signals probably mean.",
  },
  {
    title: "Creator fuel",
    prompt: "Give me 10 sharp content ideas from this topic that do not feel generic.",
  },
  {
    title: "Decision boss",
    prompt: "Compare these options and tell me the best choice for speed, risk, and payoff.",
  },
  {
    title: "Receipts only",
    prompt: "Separate facts, assumptions, and guesses in this argument.",
  },
  {
    title: "Pitch glow-up",
    prompt: "Make this pitch clearer, punchier, and harder to ignore.",
  },
  {
    title: "Text decoder",
    prompt: "Analyze this message and suggest the best reply without sounding desperate.",
  },
  {
    title: "Exam clutch",
    prompt: "Make me a last-minute study guide for this topic with the highest-yield points.",
  },
  {
    title: "Startup brain",
    prompt: "Stress-test this business idea and find the fastest way to validate it.",
  },
  {
    title: "Soft skills",
    prompt: "Help me say this honestly without sounding rude, needy, or vague.",
  },
  {
    title: "Deep dive",
    prompt: "Build a research brief from these notes and identify the unknowns.",
  },
  {
    title: "Tech check",
    prompt: "Review this system design and call out failure modes.",
  },
];

const initialMessages: Message[] = [];
const chatStorageKey = "malcom.chat.v2";
const guestSessionsKey = "malcom.guest.sessions.v1";
const guestStarsKey = "malcom.guest.stars.v1";
const startupAnimationMs = 1800;
const factRotationMs = 5000;
const authEmailRedirectTo =
  process.env.NEXT_PUBLIC_SITE_URL || "http://65.0.71.41:3000/";

const fallbackSexualHealthFacts = [
  "Consent works best as an active, ongoing check-in, not a one-time yes.",
  "Open conversations about boundaries are linked with more satisfying intimate relationships.",
  "Kissing and close touch can release oxytocin, a hormone associated with bonding and trust.",
  "Condoms are most effective when they are stored cool, dry, and used before any genital contact.",
  "Arousal is not the same thing as consent; clear communication matters every time.",
  "Regular STI screening is a normal part of sexual health, even when there are no symptoms.",
  "Stress and poor sleep can reduce libido because they affect hormones, mood, and attention.",
  "Lubrication can reduce friction and help make sex safer and more comfortable.",
];

const starterModes = [
  {
    name: "Study",
    prompt: "Teach me this topic step by step, then quiz me with five questions.",
  },
  {
    name: "Research",
    prompt: "Build a concise research brief with claims, evidence, gaps, and next steps.",
  },
  {
    name: "Code Review",
    prompt: "Review this code or design for bugs, risks, and missing tests.",
  },
  {
    name: "Explain",
    prompt: "Explain this clearly with examples and no unnecessary jargon.",
  },
  {
    name: "Draft",
    prompt: "Draft this message so it is clear, direct, and polished.",
  },
  {
    name: "Plan",
    prompt: "Turn this goal into a practical plan with priorities and concrete next actions.",
  },
];

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
          /\$\$([\s\S]*?)\$\$/g,
          (match, math: string) => {
            if (!math.trim()) {
              return match;
            }

            return `$$${normalizeMath(math)}$$`;
          },
        )
        .replace(
          /(?<!\$)\$([^$\n]+)\$(?!\$)/g,
          (match, math: string) => {
            if (!math.trim()) {
              return match;
            }

            return `$${normalizeMath(math)}$`;
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
    .replace(/\\text_\{([^}]+)\}/g, "\\text{$1}")
    .replace(/\\(hat|bar|tilde|vec)_\{([^}]+)\}/g, "\\$1{$2}")
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
    .replace(/\\text_\{([^}]+)\}/g, "\\text{$1}")
    .replace(/\\(hat|bar|tilde|vec)_\{([^}]+)\}/g, "\\$1{$2}")
    .replace(
      /\by\s*\n\s*=\s*\n\s*m\s*\n\s*x\s*\n\s*\+\s*\n\s*c\s*\n\s*y\s*=\s*m\s*x\s*\+\s*c\b/g,
      "$y = mx + c$",
    )
    .replace(/(?<!\$)\by\s*=\s*m\s*x\s*\+\s*c\b(?!\$)/g, "$y = mx + c$")
    .replace(
      /\(\s*x\s*\n\s*i\s*\n\s*,\s*y\s*\n\s*i\s*\n\s*\)\s*\(\s*x\s*i\s*,\s*y\s*i\s*\)/g,
      "$(x_i, y_i)$",
    )
    .replace(/(?<!\$)\(\s*x_i\s*,\s*y_i\s*\)(?!\$)/g, "$(x_i, y_i)$")
    .replace(
      /\\text\{([^}]+)\}\s*\\hat\{([^}]+)\}\s*=\s*m\s*x\s*\+\s*c/g,
      (_, label: string, variable: string) =>
        `$$\\text{${label}}\\hat{${variable}} = mx + c$$`,
    )
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

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value = window.localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function chatTitle(messages: Message[]) {
  const firstUser = messages.find((message) => message.role === "user");
  return firstUser?.content.slice(0, 80).trim() || "Untitled";
}

function saveGuestSession(sessionId: string, messages: Message[]) {
  if (!messages.length) {
    return;
  }

  const sessions = readJsonArray<SavedSession & { messages?: Message[] }>(
    guestSessionsKey,
  );
  const existing = sessions.find((session) => session.id === sessionId);
  const now = new Date().toISOString();
  const nextSession = {
    id: sessionId,
    title: existing?.title || chatTitle(messages),
    folder: existing?.folder || "",
    tags: existing?.tags || "",
    pinned: existing?.pinned || false,
    created_at: existing?.created_at || now,
    updated_at: now,
    messages,
  };

  writeJsonArray(
    guestSessionsKey,
    [nextSession, ...sessions.filter((session) => session.id !== sessionId)]
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
      .slice(0, 50),
  );
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

function getRandomStarterPrompts(count = 4) {
  return [...starterPromptPool]
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

const MessageItem = memo(function MessageItem({
  message,
  responseState,
  onCopy,
  onReaction,
  onRegenerate,
  onToggleStar,
  onToggleComment,
  onCommentChange,
  onSubmitComment,
  starred,
}: {
  message: Message;
  responseState?: ResponseState;
  onCopy(id: string, content: string): void;
  onReaction(id: string, reaction: ResponseReaction): void;
  onRegenerate(id: string): void;
  onToggleStar(id: string, content: string): void;
  onToggleComment(id: string): void;
  onCommentChange(id: string, comment: string): void;
  onSubmitComment(id: string): void;
  starred: boolean;
}) {
  return (
    <article
      className={`${styles.message} ${styles[message.role]} ${
        message.role === "assistant" ? styles.messageEntered : ""
      }`}
    >
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
                className={starred ? styles.actionActive : ""}
                onClick={() => onToggleStar(message.id, message.content)}
                aria-label={starred ? "Unstar response" : "Star response"}
                title={starred ? "Unstar" : "Star"}
              >
                <Star size={15} />
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
  const [starterPrompts, setStarterPrompts] = useState(() =>
    starterPromptPool.slice(0, 4),
  );
  const [factQueue, setFactQueue] = useState(fallbackSexualHealthFacts);
  const [factCursor, setFactCursor] = useState(0);
  const [factVisible, setFactVisible] = useState(true);
  const [responseStates, setResponseStates] = useState<
    Record<string, ResponseState>
  >({});
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [starredResponses, setStarredResponses] = useState<StarredResponse[]>(
    [],
  );
  const [historyStatus, setHistoryStatus] = useState("");
  const [guestSessions, setGuestSessions] = useState<
    (SavedSession & { messages?: Message[] })[]
  >([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    display_name: "",
    memory: "",
  });
  const [profileStatus, setProfileStatus] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingFolder, setEditingFolder] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const factQueueRef = useRef(fallbackSexualHealthFacts);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const starredMessageIds = useMemo(
    () => new Set(starredResponses.map((response) => response.message_id)),
    [starredResponses],
  );
  const activeSessions = authUser ? savedSessions : guestSessions;
  const filteredSessions = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();

    return activeSessions.filter((session) => {
      if (!query) {
        return true;
      }

      return [session.title, session.folder || "", session.tags || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [activeSessions, historyQuery]);
  const pinnedSessions = filteredSessions.filter((session) =>
    Boolean(session.pinned),
  );
  const unpinnedSessions = filteredSessions.filter(
    (session) => !Boolean(session.pinned),
  );
  const showUpgradePrompt =
    !authUser &&
    hasLoadedStoredChat &&
    (messages.filter((message) => message.role === "user").length >= 3 ||
      starredResponses.length > 0);

  const visiblePrompt = useMemo(
    () => messages.length === 0 && input.trim().length === 0,
    [input, messages.length],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const syncSidebar = () => setSidebarCollapsed(mediaQuery.matches);

    syncSidebar();
    mediaQuery.addEventListener("change", syncSidebar);

    const loadTimer = window.setTimeout(() => {
      const stored = loadStoredChat();
      setSessionId(stored.sessionId);
      setMessages(stored.messages);
      setGuestSessions(readJsonArray(guestSessionsKey));
      setStarredResponses(readJsonArray(guestStarsKey));
      setHasLoadedStoredChat(true);
      setStarterPrompts(getRandomStarterPrompts());
    }, 0);

    const startupTimer = window.setTimeout(
      () => setIsStarting(false),
      startupAnimationMs,
    );

    return () => {
      mediaQuery.removeEventListener("change", syncSidebar);
      window.clearTimeout(loadTimer);
      window.clearTimeout(startupTimer);
    };
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setAuthUser(data.session?.user || null);
      setAccessToken(data.session?.access_token || "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
      setAccessToken(session?.access_token || "");

      if (!session) {
        setSavedSessions([]);
        setStarredResponses([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser || !accessToken) {
      return;
    }

    void refreshUserWorkspace(accessToken);
    void syncGuestStars(accessToken);
    // refreshUserWorkspace is intentionally read from the latest render here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, accessToken]);

  useEffect(() => {
    if (!hasLoadedStoredChat) {
      return;
    }

    window.localStorage.setItem(
      chatStorageKey,
      JSON.stringify({ sessionId, messages }),
    );

    if (!authUser) {
      saveGuestSession(sessionId, messages);
      // localStorage is the external source of truth for guest history.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuestSessions(readJsonArray(guestSessionsKey));
    }
  }, [authUser, hasLoadedStoredChat, messages, sessionId]);

  useEffect(() => {
    void refreshStats();
    void refreshFactQueue();
  }, []);

  useEffect(() => {
    factQueueRef.current = factQueue;
  }, [factQueue]);

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

  useEffect(() => {
    if (!isSending) {
      return;
    }

    let fadeTimer: number | undefined;
    const timer = window.setInterval(() => {
      setFactVisible(false);
      fadeTimer = window.setTimeout(() => {
        setFactCursor((current) => {
          const queueLength = factQueueRef.current.length;

          if (queueLength < 2) {
            return current;
          }

          const next = current + 1;

          if (next >= queueLength) {
            void refreshFactQueue();
            return 0;
          }

          return next;
        });
        setFactVisible(true);
      }, 180);
    }, factRotationMs);

    return () => {
      window.clearInterval(timer);

      if (fadeTimer) {
        window.clearTimeout(fadeTimer);
      }
    };
  }, [isSending]);

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

  function authHeaders(token = accessToken): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function refreshUserWorkspace(token = accessToken) {
    if (!token) {
      return;
    }

    setHistoryStatus("");

    try {
      const [sessionsResponse, starredResponse, profileResponse] = await Promise.all([
        fetch("/api/user/chats", {
          cache: "no-store",
          headers: authHeaders(token),
        }),
        fetch("/api/user/starred-responses", {
          cache: "no-store",
          headers: authHeaders(token),
        }),
        fetch("/api/user/profile", {
          cache: "no-store",
          headers: authHeaders(token),
        }),
      ]);

      if (!sessionsResponse.ok || !starredResponse.ok || !profileResponse.ok) {
        throw new Error("Could not load account history.");
      }

      const sessionsData = (await sessionsResponse.json()) as {
        sessions?: SavedSession[];
      };
      const starredData = (await starredResponse.json()) as {
        starred?: StarredResponse[];
      };
      const profileData = (await profileResponse.json()) as {
        profile?: UserProfile;
      };

      setSavedSessions(sessionsData.sessions || []);
      setStarredResponses(starredData.starred || []);
      setProfile(profileData.profile || { display_name: "", memory: "" });
    } catch (caughtError) {
      setHistoryStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load account history.",
      );
    }
  }

  async function openSavedChat(nextSessionId: string) {
    if (!accessToken) {
      const session = guestSessions.find((item) => item.id === nextSessionId);

      if (!session) {
        return;
      }

      setSessionId(session.id);
      setMessages(session.messages || []);
      setResponseStates({});
      setError("");
      return;
    }

    setHistoryStatus("Loading chat...");

    try {
      const response = await fetch(
        `/api/user/chats?sessionId=${encodeURIComponent(nextSessionId)}`,
        {
          cache: "no-store",
          headers: authHeaders(),
        },
      );
      const data = (await response.json()) as {
        messages?: Message[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not load saved chat.");
      }

      setSessionId(nextSessionId);
      setMessages(data.messages || []);
      setResponseStates({});
      setError("");
      setHistoryStatus("");
    } catch (caughtError) {
      setHistoryStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load saved chat.",
      );
    }
  }

  async function syncGuestStars(token = accessToken) {
    const guestStars = readJsonArray<StarredResponse>(guestStarsKey);

    if (!token || guestStars.length === 0) {
      return;
    }

    await Promise.allSettled(
      guestStars.map((star) =>
        fetch("/api/user/starred-responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(token),
          },
          body: JSON.stringify({
            messageId: star.message_id,
            sessionId: star.session_id,
            content: star.content,
            starred: true,
          }),
        }),
      ),
    );

    window.localStorage.removeItem(guestStarsKey);
    await refreshUserWorkspace(token);
  }

  function beginEditSession(session: SavedSession) {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
    setEditingFolder(session.folder || "");
    setEditingTags(session.tags || "");
  }

  function updateGuestSession(
    nextSessionId: string,
    patch: Partial<SavedSession>,
  ) {
    const sessions = readJsonArray<SavedSession & { messages?: Message[] }>(
      guestSessionsKey,
    ).map((session) =>
      session.id === nextSessionId
        ? { ...session, ...patch, updated_at: new Date().toISOString() }
        : session,
    );

    writeJsonArray(guestSessionsKey, sessions);
    setGuestSessions(sessions);
  }

  async function saveSessionEdits() {
    if (!editingSessionId) {
      return;
    }

    if (!accessToken) {
      updateGuestSession(editingSessionId, {
        title: editingTitle.slice(0, 80).trim() || "Untitled",
        folder: editingFolder,
        tags: editingTags,
      });
      setEditingSessionId("");
      return;
    }

    await fetch("/api/user/chats", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({
        sessionId: editingSessionId,
        title: editingTitle,
        folder: editingFolder,
        tags: editingTags,
      }),
    });
    setEditingSessionId("");
    await refreshUserWorkspace();
  }

  async function togglePinnedSession(session: SavedSession) {
    const nextPinned = !Boolean(session.pinned);

    if (!accessToken) {
      updateGuestSession(session.id, { pinned: nextPinned });
      return;
    }

    await fetch("/api/user/chats", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ sessionId: session.id, pinned: nextPinned }),
    });
    await refreshUserWorkspace();
  }

  async function deleteSession(nextSessionId: string) {
    if (!window.confirm("Delete this chat?")) {
      return;
    }

    if (!accessToken) {
      const sessions = readJsonArray<SavedSession & { messages?: Message[] }>(
        guestSessionsKey,
      ).filter((session) => session.id !== nextSessionId);
      writeJsonArray(guestSessionsKey, sessions);
      setGuestSessions(sessions);

      if (sessionId === nextSessionId) {
        startNewChat();
      }

      return;
    }

    await fetch(`/api/user/chats?sessionId=${encodeURIComponent(nextSessionId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await refreshUserWorkspace();

    if (sessionId === nextSessionId) {
      startNewChat();
    }
  }

  function clearGuestData() {
    window.localStorage.removeItem(chatStorageKey);
    window.localStorage.removeItem(guestSessionsKey);
    window.localStorage.removeItem(guestStarsKey);
    setGuestSessions([]);
    setStarredResponses([]);
    startNewChat();
  }

  async function saveProfile() {
    if (!accessToken) {
      return;
    }

    setProfileStatus("Saving...");

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

      setProfileStatus("Saved.");
      window.setTimeout(() => setProfileStatus(""), 1200);
    } catch {
      setProfileStatus("Could not save profile.");
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const supabase = supabaseRef.current;

    if (!supabase) {
      setAuthStatus("Supabase is not configured.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthStatus("");

    try {
      const authCall =
        authMode === "sign-up"
          ? supabase.auth.signUp({
              email: authEmail.trim(),
              password: authPassword,
              options: {
                emailRedirectTo: authEmailRedirectTo,
              },
            })
          : supabase.auth.signInWithPassword({
              email: authEmail.trim(),
              password: authPassword,
            });
      const { data, error: authError } = await authCall;

      if (authError) {
        throw authError;
      }

      setAuthUser(data.user || data.session?.user || null);
      setAccessToken(data.session?.access_token || "");
      setAuthPassword("");
      setAuthStatus(
        data.session
          ? "Signed in."
          : "Check your email to confirm the account, then sign in.",
      );

      if (data.session) {
        setAuthOpen(false);
      }
    } catch (caughtError) {
      setAuthStatus(
        caughtError instanceof Error ? caughtError.message : "Sign in failed.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signOut() {
    await supabaseRef.current?.auth.signOut();
    setAuthUser(null);
    setAccessToken("");
    setSavedSessions([]);
    setStarredResponses(readJsonArray(guestStarsKey));
    setProfile({ display_name: "", memory: "" });
    setProfileOpen(false);
  }

  async function refreshFactQueue() {
    try {
      const response = await fetch("/api/sexual-health-facts?limit=80", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        facts?: { id?: number; fact?: string }[];
      };
      const facts =
        data.facts
          ?.map((item) => item.fact)
          .filter((fact): fact is string => Boolean(fact?.trim())) || [];

      if (response.ok && facts.length > 0) {
        setFactQueue(facts);
        setFactCursor(0);
        factQueueRef.current = facts;
      }
    } catch {
      // The local fallback keeps the loading card useful if the DB route fails.
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
    setFactCursor(0);
    setFactVisible(true);
    setIsSending(true);
    void refreshFactQueue();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          profileMemory: authUser ? profile.memory : "",
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
      void refreshUserWorkspace();
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
        setFactVisible(true);
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
    setStarterPrompts(getRandomStarterPrompts());
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

  async function toggleStarredResponse(id: string, content: string) {
    const nextStarred = !starredMessageIds.has(id);
    patchResponseState(id, { status: nextStarred ? "Starred" : "Unstarred" });

    if (nextStarred) {
      setStarredResponses((current) => [
        {
          id,
          message_id: id,
          session_id: sessionId,
          content,
          created_at: new Date().toISOString(),
        },
        ...current.filter((response) => response.message_id !== id),
      ]);
    } else {
      setStarredResponses((current) =>
        current.filter((response) => response.message_id !== id),
      );
    }

    if (!accessToken) {
      const nextStars = nextStarred
        ? [
            {
              id,
              message_id: id,
              session_id: sessionId,
              content,
              created_at: new Date().toISOString(),
            },
            ...starredResponses.filter((response) => response.message_id !== id),
          ]
        : starredResponses.filter((response) => response.message_id !== id);

      setStarredResponses(nextStars);
      writeJsonArray(guestStarsKey, nextStars);
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
      return;
    }

    try {
      const response = await fetch("/api/user/starred-responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          messageId: id,
          sessionId,
          content,
          starred: nextStarred,
        }),
      });

      if (!response.ok) {
        throw new Error("Star was not saved.");
      }

      void refreshUserWorkspace();
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save star" });
      void refreshUserWorkspace();
    }
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
        <div className={styles.sidebarHeader}>
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
        </div>

        <div className={styles.sidebarActions}>
          <button className={styles.primaryButton} type="button" onClick={startNewChat}>
            <Plus size={16} />
            <span>New chat</span>
          </button>

          {!authUser ? (
            <button
              className={styles.loginButton}
              type="button"
              onClick={() => {
                setAuthMode("sign-in");
                setAuthOpen(true);
              }}
              aria-label="Sign in"
              title="Login"
            >
              <LogIn size={16} />
              <span>Login</span>
            </button>
          ) : null}
        </div>

        <div className={styles.accountPanel} aria-label="Account history">
          {!authUser ? (
            <div className={styles.workspaceCard}>
              <div className={styles.workspaceIcon} aria-hidden="true">
                <HardDrive size={17} />
              </div>
              <div>
                <span>Guest workspace</span>
                <p>Stored on this device</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("sign-up");
                  setAuthOpen(true);
                }}
              >
                Sign up
              </button>
            </div>
          ) : (
            <div className={styles.workspaceCard}>
              <div className={styles.workspaceIcon} aria-hidden="true">
                <UserRound size={17} />
              </div>
              <div>
                <span>{profile.display_name || authUser.email || "Workspace"}</span>
                <p>Synced account</p>
              </div>
              <button type="button" onClick={() => setProfileOpen(true)}>
                Profile
              </button>
              <button
                className={styles.iconMiniButton}
                type="button"
                onClick={() => void refreshUserWorkspace()}
                aria-label="Refresh workspace"
                title="Refresh"
              >
                <RefreshCcw size={13} />
              </button>
            </div>
          )}

          {historyStatus ? <p>{historyStatus}</p> : null}
          {showUpgradePrompt && !authUser ? (
            <div className={styles.upgradePrompt}>
              <span>Stored on this device</span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("sign-up");
                  setAuthOpen(true);
                }}
              >
                Sync
              </button>
            </div>
          ) : null}

          <label className={styles.historySearch}>
            <Search size={14} aria-hidden="true" />
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search chats, folders, tags"
            />
          </label>

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <Pin size={13} aria-hidden="true" />
              <h2>Pinned</h2>
              <span>{pinnedSessions.length}</span>
            </div>
            <div className={styles.historyList}>
              {pinnedSessions.length ? (
                pinnedSessions.slice(0, 5).map((session) => (
                  <article key={session.id} className={styles.sessionRow}>
                    <button
                      className={styles.sessionOpenButton}
                      type="button"
                      onClick={() => void openSavedChat(session.id)}
                    >
                      <span>{session.title}</span>
                      <time>{session.folder || session.tags || "Pinned"}</time>
                    </button>
                    <div className={styles.sessionActions}>
                      <button
                        type="button"
                        onClick={() => void togglePinnedSession(session)}
                        aria-label={`Unpin ${session.title}`}
                        title="Unpin"
                      >
                        <PinOff size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEditSession(session)}
                        aria-label={`Edit ${session.title}`}
                        title="Edit"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSession(session.id)}
                        aria-label={`Delete ${session.title}`}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyNavText}>No pinned chats.</p>
              )}
            </div>
          </section>

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <MessageSquareText size={13} aria-hidden="true" />
              <h2>{authUser ? "Saved chats" : "Guest chats"}</h2>
              <span>{unpinnedSessions.length}</span>
            </div>
            <div className={styles.historyList}>
              {unpinnedSessions.length ? (
                unpinnedSessions.slice(0, 10).map((session) => (
                  <article key={session.id} className={styles.sessionRow}>
                    <button
                      className={styles.sessionOpenButton}
                      type="button"
                      onClick={() => void openSavedChat(session.id)}
                    >
                      <span>{session.title}</span>
                      <time>
                        {[session.folder, session.tags].filter(Boolean).join(" / ") ||
                          new Date(session.updated_at).toLocaleDateString()}
                      </time>
                    </button>
                    <div className={styles.sessionActions}>
                      <button
                        type="button"
                        onClick={() => void togglePinnedSession(session)}
                        aria-label={`Pin ${session.title}`}
                        title="Pin"
                      >
                        <Pin size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEditSession(session)}
                        aria-label={`Edit ${session.title}`}
                        title="Edit"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSession(session.id)}
                        aria-label={`Delete ${session.title}`}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyNavText}>
                  {authUser ? "No saved chats yet." : "No guest chats yet."}
                </p>
              )}
            </div>
          </section>

          {editingSessionId ? (
            <section className={styles.sessionEditor}>
              <h2>Edit chat</h2>
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                placeholder="Title"
              />
              <input
                value={editingFolder}
                onChange={(event) => setEditingFolder(event.target.value)}
                placeholder="Folder"
              />
              <input
                value={editingTags}
                onChange={(event) => setEditingTags(event.target.value)}
                placeholder="Tags"
              />
              <div>
                <button type="button" onClick={() => void saveSessionEdits()}>
                  Save
                </button>
                <button type="button" onClick={() => setEditingSessionId("")}>
                  Cancel
                </button>
              </div>
            </section>
          ) : null}

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <BookMarked size={13} aria-hidden="true" />
              <h2>Starred</h2>
              <span>{starredResponses.length}</span>
            </div>
            <div className={styles.historyList}>
              {starredResponses.length ? (
                starredResponses.slice(0, 8).map((response) => (
                  <button
                    className={styles.starredButton}
                    key={response.message_id}
                    type="button"
                    onClick={() => void openSavedChat(response.session_id)}
                  >
                    <span>{response.content.slice(0, 80)}</span>
                    <time>{new Date(response.created_at).toLocaleDateString()}</time>
                  </button>
                ))
              ) : (
                <p className={styles.emptyNavText}>No starred responses yet.</p>
              )}
            </div>
          </section>

          {!authUser ? (
            <button className={styles.clearGuestButton} type="button" onClick={clearGuestData}>
              Clear local chats
            </button>
          ) : null}
        </div>

        <div className={styles.sidebarFooter}>
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
              <div className={styles.modeBar} aria-label="Starter modes">
                {starterModes.map((mode) => (
                  <button
                    key={mode.name}
                    type="button"
                    onClick={() => setInput(mode.prompt)}
                  >
                    {mode.name}
                  </button>
                ))}
              </div>
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
              onToggleStar={toggleStarredResponse}
              onToggleComment={toggleResponseComment}
              onCommentChange={changeResponseComment}
              onSubmitComment={submitResponseComment}
              starred={starredMessageIds.has(message.id)}
            />
          ))}

          {isSending ? (
            <article className={`${styles.message} ${styles.assistant}`}>
              <MalcomAvatar active />
              <div className={styles.messageBody}>
                <span>Malcom</span>
                <div className={styles.thinking} aria-label="Malcom is working">
                  <strong>Malcom is working</strong>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-label="Waiting for Malcom response"
                  >
                    <span />
                  </div>
                  <p className={styles.factLabel}>Sexual health fact</p>
                  <p
                    className={`${styles.factText} ${
                      factVisible ? styles.factTextVisible : ""
                    }`}
                  >
                    {factQueue[factCursor] || fallbackSexualHealthFacts[0]}
                  </p>
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

      {profileOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setProfileOpen(false);
            }
          }}
        >
          <section
            className={styles.feedbackDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>{authUser?.email}</p>
                <h2 id="profile-title">Profile memory</h2>
              </div>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                aria-label="Close profile"
              >
                <X size={17} />
              </button>
            </div>

            <div className={styles.feedbackForm}>
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
                <span>Memory</span>
                <textarea
                  value={profile.memory}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      memory: event.target.value,
                    }))
                  }
                  placeholder="Preferences, recurring context, response style, or work focus"
                  rows={6}
                />
              </label>

              {profileStatus ? (
                <p className={styles.feedbackStatus}>{profileStatus}</p>
              ) : null}

              <button type="button" onClick={() => void saveProfile()}>
                Save profile
              </button>
              <div className={styles.authSwitch}>
                <button type="button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {authOpen ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setAuthOpen(false);
            }
          }}
        >
          <section
            className={styles.feedbackDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Account</p>
                <h2 id="auth-title">
                  {authMode === "sign-up" ? "Create account" : "Sign in"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                aria-label="Close account dialog"
              >
                <X size={17} />
              </button>
            </div>

            <form className={styles.feedbackForm} onSubmit={submitAuth}>
              <label>
                <span>Email</span>
                <input
                  required
                  type="email"
                  maxLength={180}
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="Password"
                />
              </label>

              {authStatus ? (
                <p className={styles.feedbackStatus}>{authStatus}</p>
              ) : null}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth
                  ? "Working..."
                  : authMode === "sign-up"
                    ? "Create account"
                    : "Sign in"}
              </button>

              <div className={styles.authSwitch}>
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode((current) =>
                      current === "sign-in" ? "sign-up" : "sign-in",
                    )
                  }
                >
                  {authMode === "sign-in"
                    ? "Create an account"
                    : "I already have an account"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthOpen(false);
                    setAccessOpen(true);
                  }}
                >
                  Request access
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

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
