"use client";

import Link from "next/link";
import {
  AlertCircle,
  BookMarked,
  BrainCircuit,
  ChevronDown,
  Check,
  CircleUserRound,
  Copy,
  Eye,
  EyeOff,
  EllipsisVertical,
  FileText,
  FolderOpen,
  LogIn,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pin,
  PinOff,
  Plus,
  RefreshCcw,
  Search,
  SendHorizontal,
  Settings,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  type DragEvent,
  type FormEvent,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
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
  messages?: Message[];
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

type DocumentResource = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  summary: string;
  createdAt: string;
};

type ResponseReaction = "like" | "dislike";

type ResponseState = {
  reaction?: ResponseReaction;
  copied?: boolean;
  commenting?: boolean;
  comment?: string;
  status?: string;
};

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

const initialMessages: Message[] = [];
const chatStorageKey = "malcom.chat.v3";
const guestSessionsKey = "malcom.guest.sessions.v2";
const guestStarsKey = "malcom.guest.stars.v2";
const guestDocumentsKey = "malcom.guest.documents.v2";
const guestUsageKey = "malcom.guest.responses.v1";
const guestResponseLimit = 10;
const maxUploadBytes = 2 * 1024 * 1024;
const maxSelectedDocuments = 5;

const supportedFileExtensions = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".sql",
  ".html",
  ".css",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
];

const waitingFacts = [
  "Clear consent is easiest when people ask specific questions instead of guessing.",
  "Desire often grows from feeling relaxed, respected, and unpressured.",
  "Arousal is not consent; words and comfort still matter.",
  "Good kissing is usually more about rhythm and attention than intensity.",
  "Lubrication can make intimacy safer because it reduces friction and irritation.",
  "Stress can lower libido because attention and hormones are pulled toward survival mode.",
  "Many STIs have no obvious symptoms, so testing can be normal preventive care.",
  "Talking about boundaries early usually makes intimacy feel less awkward later.",
  "Sexual confidence often comes from communication, not from knowing every move.",
  "A respectful no can build more trust than a reluctant yes.",
];

const welcomeMessages = [
  "Bring the thought you cannot quite organize yet.",
  "Ask the question that has been sitting in the back of your mind.",
  "Drop in a rough idea, a file, or a problem. We can make it clearer.",
  "Start with the messy version. Clarity can come next.",
  "What should we untangle today?",
  "Give me the spark. I will help shape it into something useful.",
  "Curiosity is enough of a starting point.",
  "Tell me what you want to understand, build, fix, or decide.",
];

function createMessageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.ceil((safeSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${Math.max(1, minutes)}m`;
  }

  return `${hours}h ${minutes}m`;
}

function decodeEmailFromAccessToken(accessToken: string) {
  const [, payload] = accessToken.split(".");

  if (!payload) {
    return "";
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const claims = JSON.parse(window.atob(padded)) as { email?: unknown };

    return typeof claims.email === "string" ? claims.email : "";
  } catch {
    return "";
  }
}

function getAuthRedirectFromUrl() {
  const [, rawHash = ""] = window.location.href.split("#");
  const hash = (window.location.hash || rawHash).replace(/^#/, "");

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const type = params.get("type") || "";

  if (!type) {
    return null;
  }

  const accessToken = params.get("access_token");

  return {
    type,
    email: accessToken ? decodeEmailFromAccessToken(accessToken) : "",
  };
}

function normalizeMath(math: string) {
  return math
    .replace(/\\frac_\{([^}]+)\}\{([^}]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\frac_([A-Za-z0-9]+)\{([^}]+)\}/g, "\\frac{$1}{$2}")
    .replace(/\\text_\{([^}]+)\}/g, "\\text{$1}")
    .replace(/\\(hat|bar|tilde|vec)_\{([^}]+)\}/g, "\\$1{$2}")
    .replace(/\\bar_\{([^}]+)\}/g, "\\bar{$1}");
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/[\u200b-\u200d\ufeff]/g, "")
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
          (match, math: string) =>
            math.trim() ? `$$${normalizeMath(math)}$$` : match,
        )
        .replace(
          /(?<!\$)\$([^$\n]+)\$(?!\$)/g,
          (match, math: string) =>
            math.trim() ? `$${normalizeMath(math)}$` : match,
        )
        .replace(/([^\n])(\s*#{1,6}\s+)/g, "$1\n\n$2")
        .replace(/([^\n])(\s*\|[^\n]+\|\s*\n\s*\|[\s:|.-]+\|)/g, "$1\n\n$2")
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("")
    .trim();
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
        <span>{language || "text"}</span>
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

const markdownComponents: Components = {
  a({ children, href }) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  code({ className, children }) {
    const rawCode = String(children).replace(/\n$/, "");
    const language = /language-(\w+)/.exec(className || "")?.[1] || "";

    if (language || rawCode.includes("\n")) {
      return <CodeBlock code={rawCode} language={language || "text"} />;
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

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Guest storage is best-effort. Chat still works without it.
  }
}

function readGuestUsage() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const value = Number(window.localStorage.getItem(guestUsageKey) || 0);

    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

function writeGuestUsage(value: number) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(guestUsageKey, String(Math.max(0, value)));
  } catch {
    // Keep in-memory usage if localStorage is unavailable.
  }
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

function chatTitle(messages: Message[]) {
  const firstUser = messages.find((message) => message.role === "user");

  return firstUser?.content.slice(0, 80).trim() || "Untitled";
}

function saveGuestSession(sessionId: string, messages: Message[]) {
  if (!messages.length) {
    return;
  }

  const sessions = readJsonArray<SavedSession>(guestSessionsKey);
  const existing = sessions.find((session) => session.id === sessionId);
  const now = new Date().toISOString();
  const nextSession: SavedSession = {
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

function isSupportedFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/xml" ||
    supportedFileExtensions.some((extension) => name.endsWith(extension))
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

function PlanBadge({
  authUser,
  usage,
  guestUsed,
}: {
  authUser: User | null;
  usage: AccountUsage | null;
  guestUsed: number;
}) {
  if (!authUser) {
    return (
      <span className={styles.planBadge}>
        Guest · {guestUsed}/{guestResponseLimit}
      </span>
    );
  }

  if (usage?.plan === "enterprise") {
    return <span className={styles.planBadge}>Enterprise</span>;
  }

  if (usage?.plan === "pro") {
    return <span className={styles.planBadge}>Pro</span>;
  }

  return (
    <span className={styles.planBadge}>
      Free · {usage?.messagesUsed ?? 0}/{usage?.messagesLimit ?? 100}
    </span>
  );
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
                  placeholder="Add a note to this response..."
                  rows={3}
                />
                <button type="button" onClick={() => onSubmitComment(message.id)}>
                  Save note
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
  const [hasLoadedStoredChat, setHasLoadedStoredChat] = useState(false);
  const [responseStates, setResponseStates] = useState<
    Record<string, ResponseState>
  >({});
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const [guestUsed, setGuestUsed] = useState(0);
  const [limitOpen, setLimitOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState("");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [guestSessions, setGuestSessions] = useState<SavedSession[]>([]);
  const [starredResponses, setStarredResponses] = useState<StarredResponse[]>(
    [],
  );
  const [profile, setProfile] = useState<UserProfile>({
    display_name: "",
    memory: "",
  });
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [openSessionMenuId, setOpenSessionMenuId] = useState("");
  const [openLibraryPanel, setOpenLibraryPanel] = useState<
    "documents" | "starred" | "pinned" | ""
  >("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDocumentId, setEditingDocumentId] = useState("");
  const [editingDocumentName, setEditingDocumentName] = useState("");
  const [documents, setDocuments] = useState<DocumentResource[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [documentStatus, setDocumentStatus] = useState("");
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [loadingNoteIndex, setLoadingNoteIndex] = useState(0);
  const [welcomeMessageIndex, setWelcomeMessageIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const authConfirmationHandledRef = useRef(false);

  const activeSessions = authUser ? savedSessions : guestSessions;
  const selectedDocuments = useMemo(
    () =>
      selectedDocumentIds
        .map((id) => documents.find((document) => document.id === id))
        .filter((document): document is DocumentResource => Boolean(document)),
    [documents, selectedDocumentIds],
  );
  const starredMessageIds = useMemo(
    () => new Set(starredResponses.map((response) => response.message_id)),
    [starredResponses],
  );
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
  const recentSessions = filteredSessions.filter(
    (session) => !Boolean(session.pinned),
  );
  const guestRemaining = Math.max(0, guestResponseLimit - guestUsed);
  const isGuestLimited = !authUser && guestRemaining <= 0;
  const isFreeLimited = Boolean(authUser && accountUsage?.isLimited);
  const isComposerDisabled = isSending || isGuestLimited || isFreeLimited;
  const visiblePrompt = messages.length === 0 && input.trim().length === 0;
  const usageSummary = authUser
    ? accountUsage?.plan === "enterprise"
      ? "Enterprise plan · highest limits"
      : accountUsage?.plan === "pro"
        ? "Pro plan · higher limits"
      : `${accountUsage?.messagesUsed ?? 0}/${accountUsage?.messagesLimit ?? 100} free messages used`
    : `Guest responses: ${guestUsed}/${guestResponseLimit} used`;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const syncSidebar = () => setSidebarCollapsed(mediaQuery.matches);

    syncSidebar();
    mediaQuery.addEventListener("change", syncSidebar);

    const loadTimer = window.setTimeout(() => {
      const stored = loadStoredChat();
      setSessionId(stored.sessionId);
      setMessages(stored.messages);
      setGuestSessions(readJsonArray<SavedSession>(guestSessionsKey));
      setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
      setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      setGuestUsed(readGuestUsage());
      setHasLoadedStoredChat(true);
    }, 0);

    return () => {
      mediaQuery.removeEventListener("change", syncSidebar);
      window.clearTimeout(loadTimer);
    };
  }, []);

  useEffect(() => {
    const authRedirect = getAuthRedirectFromUrl();
    const supabase = createSupabaseBrowserClient();
    supabaseRef.current = supabase;

    if (!supabase) {
      return;
    }

    if (
      authRedirect?.type === "signup" &&
      authRedirect.email &&
      !authConfirmationHandledRef.current
    ) {
      authConfirmationHandledRef.current = true;
      setAuthMode("sign-in");
      setAuthEmail(authRedirect.email);
      setAuthStatus(
        "Account confirmed. Enter your password to finish signing in.",
      );
      setAuthOpen(true);
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
      void supabase.auth.signOut({ scope: "local" });
    }

    if (
      (authRedirect?.type === "recovery" || authRedirect?.type === "invite") &&
      !authConfirmationHandledRef.current
    ) {
      authConfirmationHandledRef.current = true;
      setAuthMode("sign-in");
      setAuthStatus("Your email was verified. Sign in to continue.");
      setAuthOpen(true);
      window.history.replaceState(
        null,
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (authRedirect?.type === "signup") {
        return;
      }

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
        setAccountUsage(null);
        setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
        setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser || !accessToken) {
      return;
    }

    void refreshUserWorkspace(accessToken);
    void refreshDocuments(accessToken);
    void refreshUsage(accessToken);
    void syncGuestStars(accessToken);
    // These functions intentionally read the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, accessToken]);

  useEffect(() => {
    if (!hasLoadedStoredChat || authUser) {
      return;
    }

    writeJsonArray(guestDocumentsKey, documents.slice(0, 20));
  }, [authUser, documents, hasLoadedStoredChat]);

  useEffect(() => {
    if (!hasLoadedStoredChat) {
      return;
    }

    try {
      window.localStorage.setItem(
        chatStorageKey,
        JSON.stringify({ sessionId, messages }),
      );
    } catch {
      // Local storage is optional for guest mode.
    }

    if (!authUser) {
      saveGuestSession(sessionId, messages);
      window.setTimeout(() => {
        setGuestSessions(readJsonArray<SavedSession>(guestSessionsKey));
      }, 0);
    }
  }, [authUser, hasLoadedStoredChat, messages, sessionId]);

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

    const timer = window.setInterval(() => {
      setLoadingNoteIndex((current) => (current + 1) % waitingFacts.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isSending]);

  useEffect(() => {
    if (!visiblePrompt) {
      return;
    }

    const timer = window.setInterval(() => {
      setWelcomeMessageIndex(
        (current) => (current + 1) % welcomeMessages.length,
      );
    }, 3600);

    return () => window.clearInterval(timer);
  }, [visiblePrompt]);

  function authHeaders(token = accessToken): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function refreshUsage(token = accessToken) {
    if (!token) {
      return;
    }

    try {
      const response = await fetch("/api/user/usage", {
        cache: "no-store",
        headers: authHeaders(token),
      });
      const data = (await response.json()) as {
        usage?: AccountUsage;
      };

      if (response.ok && data.usage) {
        setAccountUsage(data.usage);
      }
    } catch {
      // Usage is displayed defensively; server-side chat limits still apply.
    }
  }

  async function refreshUserWorkspace(token = accessToken) {
    if (!token) {
      return;
    }

    setHistoryStatus("");

    try {
      const [sessionsResponse, starredResponse, profileResponse] =
        await Promise.all([
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

  async function refreshDocuments(token = accessToken) {
    if (!token) {
      setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        cache: "no-store",
        headers: authHeaders(token),
      });
      const data = (await response.json()) as {
        documents?: DocumentResource[];
      };

      if (response.ok) {
        setDocuments(data.documents || []);
      }
    } catch {
      setDocumentStatus("Could not load documents.");
    }
  }

  async function uploadDocument(file: File) {
    if (file.size > maxUploadBytes) {
      setDocumentStatus(`${file.name} is too large. Max size is 2 MB.`);
      return;
    }

    if (!isSupportedFile(file)) {
      setDocumentStatus(
        `${file.name} is not supported. Use text, Markdown, CSV, JSON, code, or logs.`,
      );
      return;
    }

    setDocumentStatus("");
    setIsUploadingDocument(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const data = (await response.json()) as {
        document?: DocumentResource;
        error?: string;
      };

      if (!response.ok || !data.document) {
        throw new Error(data.error || "Document was not uploaded.");
      }

      setDocuments((current) => [
        data.document as DocumentResource,
        ...current.filter((document) => document.id !== data.document?.id),
      ]);
      setSelectedDocumentIds((current) =>
        [
          data.document!.id,
          ...current.filter((id) => id !== data.document!.id),
        ].slice(0, maxSelectedDocuments),
      );
      setDocumentStatus("Attached to this conversation.");
    } catch (caughtError) {
      setDocumentStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Document was not uploaded.",
      );
    } finally {
      setIsUploadingDocument(false);

      if (documentInputRef.current) {
        documentInputRef.current.value = "";
      }
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const nextFiles = Array.from(files).slice(0, maxSelectedDocuments);

    if (!nextFiles.length) {
      return;
    }

    for (const file of nextFiles) {
      await uploadDocument(file);
    }
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  function toggleSelectedDocument(id: string) {
    setSelectedDocumentIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [id, ...current].slice(0, maxSelectedDocuments),
    );
  }

  async function deleteDocument(id: string) {
    setDocuments((current) => current.filter((document) => document.id !== id));
    setSelectedDocumentIds((current) => current.filter((item) => item !== id));

    if (!accessToken) {
      return;
    }

    try {
      await fetch(`/api/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
    } catch {
      setDocumentStatus("Document was removed locally, but server delete failed.");
    }
  }

  function beginEditDocument(document: DocumentResource) {
    setEditingDocumentId(document.id);
    setEditingDocumentName(document.name);
  }

  async function saveDocumentEdits() {
    if (!editingDocumentId) {
      return;
    }

    const nextName =
      editingDocumentName.slice(0, 180).trim() || "Untitled document";

    setDocuments((current) =>
      current.map((document) =>
        document.id === editingDocumentId
          ? { ...document, name: nextName }
          : document,
      ),
    );

    if (!accessToken) {
      setEditingDocumentId("");
      setEditingDocumentName("");
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          id: editingDocumentId,
          name: nextName,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Document was not renamed.");
      }

      setDocumentStatus("Document renamed.");
    } catch (caughtError) {
      setDocumentStatus(
        caughtError instanceof Error
          ? caughtError.message
          : "Document was not renamed.",
      );
      await refreshDocuments();
    } finally {
      setEditingDocumentId("");
      setEditingDocumentName("");
    }
  }

  async function openSavedChat(nextSessionId: string) {
    setOpenSessionMenuId("");

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
      setMessages(
        (data.messages || []).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      );
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
    setOpenSessionMenuId("");
  }

  function updateGuestSession(
    nextSessionId: string,
    patch: Partial<SavedSession>,
  ) {
    const sessions = readJsonArray<SavedSession>(guestSessionsKey).map((session) =>
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

    const nextTitle = editingTitle.slice(0, 80).trim() || "Untitled";

    if (!accessToken) {
      updateGuestSession(editingSessionId, { title: nextTitle });
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
        title: nextTitle,
      }),
    });
    setEditingSessionId("");
    await refreshUserWorkspace();
  }

  async function togglePinnedSession(session: SavedSession) {
    const nextPinned = !Boolean(session.pinned);
    setOpenSessionMenuId("");

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

  async function confirmDeleteSession(nextSessionId: string) {
    if (!accessToken) {
      const sessions = readJsonArray<SavedSession>(guestSessionsKey).filter(
        (session) => session.id !== nextSessionId,
      );
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

  function deleteSession(nextSessionId: string) {
    setOpenSessionMenuId("");
    setDeleteSessionId(nextSessionId);
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
      let data: { user: User | null; session: Session | null };

      if (authMode === "sign-up") {
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword,
          }),
        });
        const payload = await response.json();

        if (!response.ok) {
          const errorMessage = payload.error || "Account could not be created.";

          if (/already|registered|exists/i.test(errorMessage)) {
            setAuthMode("sign-in");
            setAuthPassword("");
            setAuthStatus(
              "You are already registered. Enter your password to log in.",
            );
            return;
          }

          throw new Error(errorMessage);
        }

        data = {
          user: payload.user || null,
          session: payload.session || null,
        };

        const identities = Array.isArray(payload.user?.identities)
          ? payload.user.identities
          : null;

        if (!data.session && identities && identities.length === 0) {
          setAuthMode("sign-in");
          setAuthPassword("");
          setAuthStatus(
            "You are already registered. Enter your password to log in.",
          );
          return;
        }
      } else {
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          });

        if (authError) {
          throw authError;
        }

        data = authData;
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
    setAccountUsage(null);
    setStarredResponses(readJsonArray<StarredResponse>(guestStarsKey));
    setDocuments(readJsonArray<DocumentResource>(guestDocumentsKey));
    setSelectedDocumentIds([]);
    setProfile({ display_name: "", memory: "" });
  }

  async function sendMessage(nextInput = input, baseMessages = messages) {
    const prompt = nextInput.trim();

    if (!prompt || isSending) {
      return;
    }

    if (isGuestLimited || isFreeLimited) {
      setLimitOpen(true);
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
    setLimitOpen(false);
    setIsSending(true);
    setLoadingNoteIndex(0);

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
          documentContexts: selectedDocuments.map((document) => ({
            name: document.name,
            content: document.content,
          })),
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
        usage?: AccountUsage;
      };

      if (!response.ok) {
        setMessages(baseMessages);
        setInput(prompt);

        if (data.usage) {
          setAccountUsage(data.usage);
          setLimitOpen(response.status === 429);
        }

        throw new Error(
          data.error || "Malcom could not reach the intelligence engine.",
        );
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

      if (authUser) {
        if (data.usage) {
          setAccountUsage(data.usage);
        } else {
          void refreshUsage();
        }
        void refreshUserWorkspace();
      } else {
        const nextGuestUsed = Math.min(guestResponseLimit, guestUsed + 1);
        setGuestUsed(nextGuestUsed);
        writeGuestUsage(nextGuestUsed);
      }
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
    setOpenSessionMenuId("");
    abortRef.current?.abort();
    abortRef.current = null;
    requestTokenRef.current += 1;
    setIsSending(false);
    setSessionId(createMessageId());
    setMessages(initialMessages);
    setResponseStates({});
    setInput("");
    setError("");
    setDocumentStatus("");
    setSelectedDocumentIds([]);
    window.localStorage.removeItem(chatStorageKey);
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

    const nextStar = {
      id,
      message_id: id,
      session_id: sessionId,
      content,
      created_at: new Date().toISOString(),
    };

    if (!accessToken) {
      const nextStars = nextStarred
        ? [
            nextStar,
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

      await refreshUserWorkspace();
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save star" });
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
      patchResponseState(id, { status: "Write a note first" });
      return;
    }

    patchResponseState(id, { status: "Saving..." });

    try {
      await saveResponseAction(id, "comment", comment);
      patchResponseState(id, {
        comment: "",
        commenting: false,
        status: "Note saved",
      });
      window.setTimeout(() => patchResponseState(id, { status: "" }), 1200);
    } catch {
      patchResponseState(id, { status: "Could not save note" });
    }
  }

  function regenerateResponse(id: string) {
    const responseIndex = messages.findIndex((message) => message.id === id);

    if (responseIndex < 1 || isSending || isComposerDisabled) {
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

  function focusComposer() {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function openAuth(mode: "sign-in" | "sign-up") {
    setAuthMode(mode);
    setAuthStatus("");
    setAuthOpen(true);
  }

  function renderSessionRow(session: SavedSession, metaText?: string) {
    const isMenuOpen = openSessionMenuId === session.id;
    const isPinned = Boolean(session.pinned);
    const sessionMeta =
      metaText || new Date(session.updated_at).toLocaleDateString();

    return (
      <article key={session.id} className={styles.sessionRow}>
        <button
          className={styles.sessionOpenButton}
          type="button"
          onClick={() => void openSavedChat(session.id)}
        >
          <span>{session.title}</span>
          <time>{sessionMeta}</time>
        </button>
        <div className={styles.sessionActions}>
          <button
            type="button"
            onClick={() =>
              setOpenSessionMenuId((current) =>
                current === session.id ? "" : session.id,
              )
            }
            aria-label={`Open actions for ${session.title}`}
            aria-expanded={isMenuOpen}
            title="Chat actions"
          >
            <EllipsisVertical size={15} />
          </button>
          {isMenuOpen ? (
            <div className={styles.sessionMenu}>
              <button type="button" onClick={() => void togglePinnedSession(session)}>
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                <span>{isPinned ? "Unpin" : "Pin"}</span>
              </button>
              <button type="button" onClick={() => beginEditSession(session)}>
                <FileText size={14} />
                <span>Rename</span>
              </button>
              <button type="button" onClick={() => void deleteSession(session.id)}>
                <Trash2 size={14} />
                <span>Delete</span>
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <main
      className={`${styles.shell} ${
        sidebarCollapsed ? styles.shellCollapsed : ""
      }`}
    >
      <aside className={styles.sidebar} aria-label="Malcom navigation">
        <div className={styles.sidebarHeader}>
          <button
            className={styles.brand}
            type="button"
            onClick={focusComposer}
            aria-label="Focus Malcom prompt"
          >
            <MalcomAvatar active />
            <span>
              <strong>Malcom</strong>
              <small>Research workspace</small>
            </span>
          </button>

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
            <span>New Chat</span>
          </button>

          {!authUser ? (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => openAuth("sign-up")}
            >
              <LogIn size={16} />
              <span>Sign up free</span>
            </button>
          ) : null}
        </div>

        <div className={styles.sidebarScroll}>
          <div className={styles.workspacePanel}>
            <div>
              <PlanBadge authUser={authUser} usage={accountUsage} guestUsed={guestUsed} />
              <p>
                {authUser
                  ? profile.display_name || authUser.email || "Synced account"
                  : "Guest chats stay on this device."}
              </p>
            </div>
            {!authUser ? (
              <button type="button" onClick={() => openAuth("sign-in")}>
                Log in
              </button>
            ) : (
              <button type="button" onClick={() => void signOut()}>
                <LogOut size={14} />
              </button>
            )}
          </div>

          <label className={styles.historySearch}>
            <Search size={14} aria-hidden="true" />
            <input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search chats"
            />
          </label>

          {historyStatus ? <p className={styles.sidebarStatus}>{historyStatus}</p> : null}

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <FolderOpen size={14} aria-hidden="true" />
              <h2>Library</h2>
            </div>

            <div className={styles.libraryGrid}>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "documents" ? "" : "documents",
                  )
                }
                aria-expanded={openLibraryPanel === "documents"}
              >
                <FileText size={14} />
                <span>Documents</span>
                {documents.length ? <strong>{documents.length}</strong> : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "documents" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "starred" ? "" : "starred",
                  )
                }
                aria-expanded={openLibraryPanel === "starred"}
              >
                <BookMarked size={14} />
                <span>Starred</span>
                {starredResponses.length ? (
                  <strong>{starredResponses.length}</strong>
                ) : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "starred" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  setOpenLibraryPanel((current) =>
                    current === "pinned" ? "" : "pinned",
                  )
                }
                aria-expanded={openLibraryPanel === "pinned"}
              >
                <Pin size={14} />
                <span>Pinned</span>
                {pinnedSessions.length ? <strong>{pinnedSessions.length}</strong> : null}
                <ChevronDown
                  className={
                    openLibraryPanel === "pinned" ? styles.libraryIconOpen : ""
                  }
                  size={14}
                />
              </button>
            </div>

            {openLibraryPanel === "documents" ? (
              <div className={styles.libraryPanel}>
                {documents.length ? (
                  <div className={styles.documentList}>
                    {documents.slice(0, 5).map((document) => {
                      const selected = selectedDocumentIds.includes(document.id);

                      return (
                        <article
                          key={document.id}
                          className={`${styles.documentRow} ${
                            selected ? styles.documentSelected : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSelectedDocument(document.id)}
                            aria-pressed={selected}
                          >
                            <span>{document.name}</span>
                            <time>{formatBytes(document.size)}</time>
                          </button>
                          <div className={styles.documentActions}>
                            <button
                              type="button"
                              onClick={() => beginEditDocument(document)}
                              aria-label={`Rename ${document.name}`}
                              title="Rename"
                            >
                              <FileText size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteDocument(document.id)}
                              aria-label={`Delete ${document.name}`}
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No documents yet.</p>
                )}
              </div>
            ) : null}

            {openLibraryPanel === "starred" ? (
              <div className={styles.libraryPanel}>
                {starredResponses.length ? (
                  <div className={styles.starredList}>
                    {starredResponses.slice(0, 5).map((response) => (
                      <button
                        key={response.id}
                        type="button"
                        onClick={() => void copyResponse(response.message_id, response.content)}
                        title="Copy starred response"
                      >
                        <BookMarked size={13} />
                        <span>{response.content.slice(0, 90)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No starred responses yet.</p>
                )}
              </div>
            ) : null}

            {openLibraryPanel === "pinned" ? (
              <div className={styles.libraryPanel}>
                {pinnedSessions.length ? (
                  <div className={styles.historyList}>
                    {pinnedSessions
                      .slice(0, 4)
                      .map((session) => renderSessionRow(session, "Pinned"))}
                  </div>
                ) : (
                  <p className={styles.sidebarStatus}>No pinned chats yet.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className={styles.navSection}>
            <div className={styles.navSectionHeader}>
              <MessageSquareText size={14} aria-hidden="true" />
              <h2>Chats</h2>
            </div>

            <div className={styles.historyList}>
              {recentSessions
                .slice(0, 10)
                .map((session) => renderSessionRow(session))}
            </div>
          </section>

          {editingSessionId ? (
            <section className={styles.sessionEditor}>
              <h2>Rename chat</h2>
              <input
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                placeholder="Chat title"
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

          {editingDocumentId ? (
            <section className={styles.sessionEditor}>
              <h2>Rename document</h2>
              <input
                value={editingDocumentName}
                onChange={(event) => setEditingDocumentName(event.target.value)}
                placeholder="Document name"
              />
              <div>
                <button type="button" onClick={() => void saveDocumentEdits()}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDocumentId("");
                    setEditingDocumentName("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <div className={styles.sidebarFooter}>
          <Link href="/settings">
            <Settings size={15} />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      <section className={styles.chat}>
        <div className={styles.thread} ref={threadRef} aria-live="polite">
          {visiblePrompt ? (
            <section className={styles.emptyState}>
              <p key={welcomeMessageIndex} className={styles.welcomeLine}>
                {welcomeMessages[welcomeMessageIndex]}
              </p>
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
                  <strong>Working on it</strong>
                  <div
                    className={styles.progressTrack}
                    role="progressbar"
                    aria-label="Waiting for Malcom response"
                  >
                    <span />
                  </div>
                  <p>{waitingFacts[loadingNoteIndex]}</p>
                </div>
              </div>
            </article>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {limitOpen || isGuestLimited || isFreeLimited ? (
            <div className={styles.limitCard}>
              <AlertCircle size={16} />
              <div>
                <strong>
                  {isGuestLimited
                    ? "You have used your 10 guest responses."
                    : "Your free message window is cooling down."}
                </strong>
                <p>
                  {isGuestLimited
                    ? "Create a free account to continue and save chats across devices."
                    : `Cooldown ends in ${formatDuration(
                        accountUsage?.cooldownSecondsRemaining || 0,
                      )}. Upgrade to Pro for higher limits.`}
                </p>
              </div>
              <div>
                {!authUser ? (
                  <>
                    <button type="button" onClick={() => openAuth("sign-in")}>
                      Login
                    </button>
                    <button type="button" onClick={() => openAuth("sign-up")}>
                      Register
                    </button>
                  </>
                ) : (
                  <Link href="/settings">Open settings</Link>
                )}
              </div>
            </div>
          ) : null}

          {selectedDocuments.length ? (
            <div className={styles.attachmentStrip} aria-label="Attached documents">
              {selectedDocuments.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => toggleSelectedDocument(document.id)}
                  title="Remove document context"
                >
                  <FileText size={14} />
                  <span>{document.name}</span>
                  <small>{formatBytes(document.size)}</small>
                  <X size={13} />
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <p className={styles.error}>
              <AlertCircle size={16} />
              {error}
            </p>
          ) : null}

          {documentStatus ? (
            <p className={styles.documentStatus}>{documentStatus}</p>
          ) : null}

          <form
            className={`${styles.composer} ${
              isDragActive ? styles.composerDragging : ""
            }`}
            onSubmit={handleSubmit}
            onDrop={handleDrop}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
          >
            <input
              ref={documentInputRef}
              className={styles.fileInput}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.xml,.yaml,.yml,.log,text/*,application/json"
              onChange={(event) => {
                if (event.target.files) {
                  void handleFiles(event.target.files);
                }
              }}
            />
            <div className={styles.composerTop}>
              <textarea
                ref={textareaRef}
                aria-label="Ask Malcom"
                placeholder="Ask Malcom to analyze, explain, code, compare, or summarize..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={isComposerDisabled}
                rows={2}
              />
            </div>
            <div className={styles.composerBottom}>
              <button
                className={styles.attachButton}
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={isUploadingDocument || isComposerDisabled}
              >
                <Paperclip size={15} />
                <span>{isUploadingDocument ? "Uploading" : "Attach"}</span>
              </button>
              <p>
                Supports text, Markdown, CSV, JSON, code files, and logs. Max 2
                MB each.
              </p>
              <span className={styles.shortcutHint}>
                Enter to send · Shift+Enter for new line
              </span>
              <button
                className={styles.sendButton}
                type="submit"
                disabled={isComposerDisabled || !input.trim()}
              >
                <SendHorizontal size={17} />
                <span>{isSending ? "Sending" : "Send"}</span>
              </button>
            </div>
          </form>

          <div className={styles.composerMeta}>
            <span>{usageSummary}</span>
            <span>Uploaded files are used only for this conversation.</span>
          </div>
        </div>
      </section>

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
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Account</p>
                <h2 id="auth-title">
                  {authMode === "sign-up" ? "Create account" : "Log in"}
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

            <form className={styles.dialogForm} onSubmit={submitAuth}>
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
                <div className={styles.passwordField}>
                  <input
                    required
                    type={authPasswordVisible ? "text" : "password"}
                    minLength={6}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setAuthPasswordVisible((current) => !current)}
                    aria-label={
                      authPasswordVisible ? "Hide password" : "Show password"
                    }
                    title={authPasswordVisible ? "Hide password" : "Show password"}
                  >
                    {authPasswordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {authStatus ? <p className={styles.dialogStatus}>{authStatus}</p> : null}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth
                  ? "Working..."
                  : authMode === "sign-up"
                    ? "Create account"
                    : "Log in"}
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
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleteSessionId ? (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteSessionId("");
            }
          }}
        >
          <section
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
          >
            <div className={styles.dialogHeader}>
              <div>
                <p>Chat</p>
                <h2 id="delete-chat-title">Delete this chat?</h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSessionId("")}
                aria-label="Close delete confirmation"
              >
                <X size={17} />
              </button>
            </div>
            <div className={styles.dialogForm}>
              <p className={styles.dialogStatus}>
                This removes the chat from your history.
              </p>
              <div className={styles.authSwitch}>
                <button type="button" onClick={() => setDeleteSessionId("")}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.dangerAction}
                  onClick={() => {
                    const nextSessionId = deleteSessionId;
                    setDeleteSessionId("");
                    void confirmDeleteSession(nextSessionId);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

    </main>
  );
}
