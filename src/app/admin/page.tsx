import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  Database,
  FileText,
  Gauge,
  HeartHandshake,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  adminSessionCookieName,
  createAdminSessionToken,
  getAdminSession,
  getAdminSessionCookieOptions,
  hasAdminCredentials,
  isValidAdminCredentials,
} from "@/lib/admin-auth";
import {
  getAdminDashboardData,
  getRecentAccessRequests,
  getRecentFeedback,
  getRecentMessages,
  getRecentResponseFeedback,
  getRecentSessions,
  getRecentUserPromptPatterns,
  type StoredMessage,
  updateAccessRequestStatus,
} from "@/lib/database";
import { getAppHealth } from "@/lib/health";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Malcom Admin Dashboard",
  description: "Monitor users, usage, billing, feedback, chats, and platform health.",
};

type HealthStatus = "ok" | "warn" | "fail";
type AdminView =
  | "overview"
  | "users"
  | "activity"
  | "access"
  | "feedback"
  | "messages";
type AdminPageProps = {
  searchParams?: Promise<{
    login?: string | string[] | undefined;
    view?: string | string[] | undefined;
  }>;
};

const adminNavItems: Array<{
  view: AdminView;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    view: "overview",
    label: "Overview",
    description: "Health, usage, and revenue",
    icon: Gauge,
  },
  {
    view: "users",
    label: "Users",
    description: "Accounts and profiles",
    icon: Users,
  },
  {
    view: "activity",
    label: "Activity",
    description: "Chats, sessions, and reactions",
    icon: Activity,
  },
  {
    view: "access",
    label: "Access",
    description: "Requests and approvals",
    icon: ShieldCheck,
  },
  {
    view: "feedback",
    label: "Feedback",
    description: "Ratings and product notes",
    icon: HeartHandshake,
  },
  {
    view: "messages",
    label: "Messages",
    description: "Recent saved content",
    icon: MessageSquareText,
  },
];

const adminNavGroups: Array<{
  label: string;
  views: AdminView[];
}> = [
  { label: "Monitor", views: ["overview", "activity"] },
  { label: "People", views: ["users", "access"] },
  { label: "Signals", views: ["feedback", "messages"] },
];

async function assertAdminAction() {
  const cookieStore = await cookies();
  const session = getAdminSession(
    cookieStore.get(adminSessionCookieName)?.value,
  );

  if (!session) {
    throw new Error("Unauthorized admin action.");
  }
}

async function loginAdmin(formData: FormData) {
  "use server";

  if (!hasAdminCredentials()) {
    redirect("/admin?login=unconfigured");
  }

  const user = String(formData.get("user") || "").trim();
  const password = String(formData.get("password") || "");

  if (!isValidAdminCredentials(user, password)) {
    redirect("/admin?login=invalid");
  }

  const cookieStore = await cookies();
  cookieStore.set(
    adminSessionCookieName,
    createAdminSessionToken(),
    getAdminSessionCookieOptions(),
  );
  redirect("/admin");
}

async function logoutAdmin() {
  "use server";

  const cookieStore = await cookies();
  cookieStore.set(
    adminSessionCookieName,
    "",
    getAdminSessionCookieOptions(0),
  );
  redirect("/admin");
}

async function setAccessStatus(formData: FormData) {
  "use server";

  await assertAdminAction();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");

  if (
    !id ||
    (status !== "pending" && status !== "approved" && status !== "rejected")
  ) {
    return;
  }

  await updateAccessRequestStatus({ id, status });
  revalidatePath("/admin");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${formatInteger(value)} B`;
  }

  if (value < 1024 * 1024) {
    return `${formatDecimal(value / 1024)} KB`;
  }

  return `${formatDecimal(value / (1024 * 1024))} MB`;
}

function formatDateTime(value: string) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatRelative(value: string) {
  if (!value) {
    return "No activity";
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return "Just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function formatCompactUserId(userId: string) {
  if (userId.length <= 14) {
    return userId;
  }

  return `${userId.slice(0, 8)}...${userId.slice(-4)}`;
}

type MessageRule = {
  label: string;
  patterns: RegExp[];
};

type CountedInsight = {
  label: string;
  count: number;
  share: number;
};

const messageStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "but",
  "can",
  "could",
  "did",
  "does",
  "doing",
  "for",
  "from",
  "get",
  "have",
  "help",
  "how",
  "into",
  "just",
  "like",
  "make",
  "need",
  "not",
  "now",
  "out",
  "please",
  "should",
  "that",
  "the",
  "this",
  "with",
  "what",
  "when",
  "where",
  "why",
  "will",
  "you",
  "your",
]);

const intentRules: MessageRule[] = [
  {
    label: "Build/debug code",
    patterns: [
      /\b(api|bug|build|code|debug|deploy|error|fix|function|next|npm|react|route|server|sql|supabase|typescript)\b/i,
      /\/(admin|api|chat|new)\b/i,
    ],
  },
  {
    label: "Data/admin analysis",
    patterns: [
      /\b(admin|analysis|analytics|dashboard|data|insight|metric|report|stats|trend|user activity)\b/i,
    ],
  },
  {
    label: "Research/learning",
    patterns: [
      /\b(compare|explain|guide|learn|research|source|study|understand|what is|why does)\b/i,
    ],
  },
  {
    label: "Writing/editing",
    patterns: [
      /\b(copy|draft|edit|email|rewrite|summarize|tone|write|writing)\b/i,
    ],
  },
  {
    label: "Planning/strategy",
    patterns: [
      /\b(plan|prioritize|roadmap|schedule|strategy|tasks|workflow)\b/i,
    ],
  },
  {
    label: "Account/billing",
    patterns: [
      /\b(account|auth|billing|checkout|login|payment|plan|stripe|subscription|upgrade)\b/i,
    ],
  },
];

const topicRules: MessageRule[] = [
  {
    label: "Product operations",
    patterns: [/\b(admin|dashboard|insight|metric|messages|users?)\b/i],
  },
  {
    label: "App engineering",
    patterns: [/\b(api|build|code|component|css|next|page|react|route|server)\b/i],
  },
  {
    label: "Data/database",
    patterns: [/\b(database|migration|postgres|sql|sqlite|supabase|table)\b/i],
  },
  {
    label: "Auth and billing",
    patterns: [/\b(auth|checkout|login|payment|stripe|subscription|user)\b/i],
  },
  {
    label: "Documents and research",
    patterns: [/\b(document|file|pdf|research|source|summarize)\b/i],
  },
  {
    label: "Writing and communication",
    patterns: [/\b(copy|draft|email|rewrite|tone|write)\b/i],
  },
];

function tokenizeMessage(content: string) {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[-/.]+|[-/.]+$/g, ""))
    .filter(
      (token) =>
        token.length > 2 &&
        !messageStopWords.has(token) &&
        !/^\d+$/.test(token),
    );
}

function wordCount(content: string) {
  return tokenizeMessage(content).length;
}

function scoreRules(content: string, rules: MessageRule[]) {
  return rules
    .map((rule) => ({
      label: rule.label,
      count: rule.patterns.filter((pattern) => pattern.test(content)).length,
    }))
    .filter((result) => result.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function classifyMessage(content: string, rules: MessageRule[], fallback: string) {
  return scoreRules(content, rules)[0]?.label || fallback;
}

function topCounts(values: string[], total: number, limit = 5): CountedInsight[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: total ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function hasFrictionSignal(content: string) {
  return /\b(500|blocked|broken|bug|cannot|can't|crash|doesn't work|error|fail(?:ed|ing)?|fix|issue|problem|stuck|unknown|unavailable)\b/i.test(
    content,
  );
}

function hasQuestionSignal(content: string) {
  return /\?/.test(content) || /^(can|could|do|does|how|is|should|what|when|where|why)\b/i.test(content.trim());
}

function hasCodeSignal(content: string) {
  return /```|\/(admin|api|chat|new)\b|\b(api|build|css|function|next|npm|react|route|sql|supabase|typescript)\b/i.test(
    content,
  );
}

function buildSavedMessageInsights(messages: StoredMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user");
  const assistantMessages = messages.filter(
    (message) => message.role === "assistant",
  );
  const userTotal = userMessages.length || 1;
  const userContents = userMessages.map((message) => message.content);
  const intents = topCounts(
    userContents.map((content) =>
      classifyMessage(content, intentRules, "General support"),
    ),
    userTotal,
    6,
  );
  const topics = topCounts(
    userContents.map((content) =>
      classifyMessage(content, topicRules, "General workspace"),
    ),
    userTotal,
    6,
  );
  const termCounts = new Map<string, number>();

  for (const content of userContents) {
    for (const token of tokenizeMessage(content)) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }
  }

  const topTerms = [...termCounts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: userMessages.length ? count / userMessages.length : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);
  const averagePromptWords =
    userMessages.reduce((total, message) => total + wordCount(message.content), 0) /
    userTotal;
  const questionRate =
    userMessages.filter((message) => hasQuestionSignal(message.content)).length /
    userTotal;
  const codeSignalRate =
    userMessages.filter((message) => hasCodeSignal(message.content)).length /
    userTotal;
  const frictionRate =
    userMessages.filter((message) => hasFrictionSignal(message.content)).length /
    userTotal;
  const activeSessionCount = new Set(
    messages.map((message) => message.session_id).filter(Boolean),
  ).size;
  const dominantIntent = intents[0];
  const dominantTopic = topics[0];
  const insightBullets = userMessages.length
    ? [
        `${dominantIntent?.label || "General support"} is the dominant intent across recent prompts (${formatPercent(
          dominantIntent?.share || 0,
        )}).`,
        `${dominantTopic?.label || "General workspace"} is the strongest topic cluster; top terms are ${
          topTerms
            .slice(0, 4)
            .map((term) => term.label)
            .join(", ") || "not enough data"
        }.`,
        `Friction or stuck-user language appears in ${formatPercent(
          frictionRate,
        )} of recent prompts.`,
        `${formatPercent(codeSignalRate)} of prompts include code, route, API, or database signals.`,
      ]
    : ["No saved user prompts are available for analysis yet."];

  return {
    savedMessages: messages.length,
    userMessages: userMessages.length,
    assistantMessages: assistantMessages.length,
    activeSessionCount,
    averagePromptWords,
    questionRate,
    codeSignalRate,
    frictionRate,
    intents,
    topics,
    topTerms,
    insightBullets,
    recentPrompts: userMessages.slice(0, 8).map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      intent: classifyMessage(message.content, intentRules, "General support"),
      topic: classifyMessage(message.content, topicRules, "General workspace"),
      friction: hasFrictionSignal(message.content),
    })),
  };
}

function healthLabel(status: HealthStatus) {
  if (status === "ok") {
    return "Operational";
  }

  if (status === "warn") {
    return "Needs attention";
  }

  return "Unavailable";
}

function statusClass(status: HealthStatus) {
  if (status === "ok") {
    return styles.statusOk;
  }

  if (status === "warn") {
    return styles.statusWarn;
  }

  return styles.statusFail;
}

function accessStatusClass(status: string) {
  if (status === "approved") {
    return styles.statusOk;
  }

  if (status === "rejected") {
    return styles.statusFail;
  }

  return styles.statusWarn;
}

function normalizeAdminView(value: string | string[] | undefined): AdminView {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return adminNavItems.some((item) => item.view === rawValue)
    ? (rawValue as AdminView)
    : "overview";
}

function planClass(plan: string) {
  if (plan === "enterprise") {
    return styles.planEnterprise;
  }

  if (plan === "pro") {
    return styles.planPro;
  }

  if (plan === "unknown") {
    return styles.planUnknown;
  }

  return styles.planFree;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <article className={`${styles.metricCard} ${styles[`metric${tone}`]}`}>
      <div className={styles.metricIcon}>
        <Icon size={18} aria-hidden />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function StatusCell({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  status: HealthStatus;
  detail: string;
}) {
  return (
    <article className={styles.statusCell}>
      <div>
        <Icon size={17} aria-hidden />
        <span>{label}</span>
      </div>
      <strong className={`${styles.statusPill} ${statusClass(status)}`}>
        {healthLabel(status)}
      </strong>
      <p>{detail}</p>
    </article>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className={styles.emptyCell}>
        {label}
      </td>
    </tr>
  );
}

function getLoginMessage(
  code: string | string[] | undefined,
  credentialsConfigured: boolean,
) {
  if (!credentialsConfigured) {
    return "Admin credentials are not configured. Set MALCOM_ADMIN_USER and MALCOM_ADMIN_PASSWORD on the server.";
  }

  const value = Array.isArray(code) ? code[0] : code;

  if (value === "invalid") {
    return "The username or password is incorrect.";
  }

  if (value === "unconfigured") {
    return "Admin credentials are not configured on this server.";
  }

  return "";
}

function AdminLogin({
  credentialsConfigured,
  message,
}: {
  credentialsConfigured: boolean;
  message: string;
}) {
  return (
    <main className={`${styles.admin} ${styles.loginShell}`}>
      <section className={styles.loginPanel} aria-labelledby="admin-login-title">
        <div className={styles.loginIntro}>
          <div className={styles.loginIcon}>
            <LockKeyhole size={22} aria-hidden />
          </div>
          <span>Malcom Admin</span>
          <h1 id="admin-login-title">Admin sign in</h1>
          <p>Access operations, health, billing, feedback, and user activity.</p>
        </div>

        <form className={styles.loginForm} action={loginAdmin}>
          <label className={styles.loginField}>
            <span>Username</span>
            <div>
              <KeyRound size={16} aria-hidden />
              <input
                required
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                disabled={!credentialsConfigured}
                maxLength={180}
                name="user"
                placeholder="admin"
                spellCheck={false}
                type="text"
              />
            </div>
          </label>

          <label className={styles.loginField}>
            <span>Password</span>
            <div>
              <ShieldCheck size={16} aria-hidden />
              <input
                required
                autoComplete="current-password"
                disabled={!credentialsConfigured}
                name="password"
                placeholder="Password"
                type="password"
              />
            </div>
          </label>

          {message ? (
            <p className={styles.loginMessage} role="alert">
              <CircleAlert size={15} aria-hidden />
              {message}
            </p>
          ) : null}

          <button
            className={styles.loginButton}
            disabled={!credentialsConfigured}
            type="submit"
          >
            <LogIn size={16} aria-hidden />
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const credentialsConfigured = hasAdminCredentials();
  const query = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const session = getAdminSession(
    cookieStore.get(adminSessionCookieName)?.value,
  );

  if (!credentialsConfigured || !session) {
    return (
      <AdminLogin
        credentialsConfigured={credentialsConfigured}
        message={getLoginMessage(query.login, credentialsConfigured)}
      />
    );
  }

  const [
    dashboard,
    health,
    feedback,
    accessRequests,
    responseActions,
    sessions,
    messages,
    userPatterns,
  ] = await Promise.all([
    getAdminDashboardData(300),
    getAppHealth(),
    getRecentFeedback(25),
    getRecentAccessRequests(50),
    getRecentResponseFeedback(50),
    getRecentSessions(30),
    getRecentMessages(200),
    getRecentUserPromptPatterns(9),
  ]);
  const messageInsights = buildSavedMessageInsights(messages);
  const maxDailyMessages = Math.max(
    1,
    ...dashboard.daily.map((metric) => metric.messages),
  );
  const maxDailySessions = Math.max(
    1,
    ...dashboard.daily.map((metric) => metric.sessions),
  );
  const maxDailySignups = Math.max(
    1,
    ...dashboard.daily.map((metric) => metric.signups),
  );
  const paidShare = dashboard.stats.registeredUsers
    ? dashboard.stats.activeSubscriptions / dashboard.stats.registeredUsers
    : 0;
  const positiveResponses = dashboard.stats.responseActions
    ? dashboard.stats.likedResponses / dashboard.stats.responseActions
    : 0;
  const databaseLabel =
    dashboard.storageMode === "supabase" ? "PostgreSQL" : "PostgreSQL degraded";
  const databaseStatus: HealthStatus =
    dashboard.storageMode === "supabase" ? health.database.supabase.status : "warn";
  const databaseDetail =
    dashboard.storageMode === "supabase"
      ? "Supabase PostgreSQL primary database"
      : health.database.supabase.fallbackReason ||
        "Supabase PostgreSQL is not serving admin data.";
  const registrationSource =
    dashboard.registrationSource === "supabase-auth"
      ? "Supabase Auth"
      : "first saved user activity";
  const activeView = normalizeAdminView(query.view);
  const activeNavItem =
    adminNavItems.find((item) => item.view === activeView) || adminNavItems[0];
  const navCounts: Record<AdminView, string> = {
    overview: health.app.status === "ok" ? "OK" : "Check",
    users: formatInteger(dashboard.stats.knownUsers),
    activity: formatInteger(dashboard.stats.sessions7d),
    access: formatInteger(dashboard.stats.pendingAccessRequests),
    feedback: formatInteger(dashboard.stats.feedback),
    messages: formatInteger(dashboard.stats.messages7d),
  };
  const userDirectory = new Map(
    dashboard.users.map((user) => [user.id, user]),
  );
  const getUserIdentity = (userId: string | null | undefined) => {
    if (!userId) {
      return {
        primary: "Guest",
        secondary: "No signed-in account",
      };
    }

    const user = userDirectory.get(userId);
    const compactUserId = formatCompactUserId(userId);
    const primary = user?.displayName || user?.email || `User ${compactUserId}`;
    const secondary =
      user?.displayName && user?.email
        ? user.email
        : `ID ${compactUserId}`;

    return { primary, secondary };
  };

  return (
    <main className={styles.adminShell}>
      <input
        id="admin-sidebar-toggle"
        className={styles.sidebarToggleInput}
        type="checkbox"
        aria-label="Collapse admin sidebar"
      />
      <aside className={styles.adminSidebar} aria-label="Admin navigation">
        <div className={styles.sidebarBrand}>
          <div>
            <ShieldCheck size={19} aria-hidden />
          </div>
          <span>
            <strong>Malcom</strong>
            <small>Admin Console</small>
          </span>
          <label
            className={styles.sidebarToggleButton}
            htmlFor="admin-sidebar-toggle"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <PanelLeftClose size={16} aria-hidden />
          </label>
        </div>

        <nav className={styles.sideNav} aria-label="Dashboard sections">
          {adminNavGroups.map((group) => {
            const groupItems = group.views
              .map((view) => adminNavItems.find((item) => item.view === view))
              .filter((item): item is (typeof adminNavItems)[number] =>
                Boolean(item),
              );
            const isGroupActive = group.views.includes(activeView);

            return (
              <details
                key={group.label}
                className={styles.navGroup}
                open={isGroupActive}
              >
                <summary>{group.label}</summary>
                <div>
                  {groupItems.map(({ view, label, description, icon: Icon }) => (
                    <Link
                      key={view}
                      href={`/admin?view=${view}`}
                      className={`${styles.navLink} ${
                        activeView === view ? styles.navLinkActive : ""
                      }`}
                      aria-current={activeView === view ? "page" : undefined}
                    >
                      <Icon size={16} aria-hidden />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <b>{navCounts[view]}</b>
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}
        </nav>

        <div className={styles.sidebarStatus}>
          <span>Database</span>
          <strong>{databaseLabel}</strong>
          <p>{databaseDetail}</p>
        </div>

        <div className={styles.sidebarFooter}>
          <Link href="/chat">Open app</Link>
          <form action={logoutAdmin}>
            <button className={styles.logoutButton} type="submit">
              <LogOut size={15} aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </aside>

      <section className={styles.adminMain}>
        <header className={styles.topbar}>
          <div>
            <p>Admin / {activeNavItem.label}</p>
            <h1>{activeNavItem.label}</h1>
            <span>
              Generated {formatDateTime(dashboard.generatedAt)} UTC from{" "}
              {registrationSource}.
            </span>
          </div>
          <div className={styles.topbarActions}>
            <span>
              <ShieldCheck size={15} aria-hidden />
              {session.user}
            </span>
            <span>
              <KeyRound size={15} aria-hidden />
              Expires {formatDateTime(session.expiresAt)} UTC
            </span>
            <span>
              <Database size={15} aria-hidden />
              {databaseLabel}
            </span>
          </div>
        </header>

        <div className={styles.adminTabs} aria-label="Admin quick navigation">
          {adminNavItems.map(({ view, label }) => (
            <Link
              key={view}
              href={`/admin?view=${view}`}
              aria-current={activeView === view ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className={styles.content}>
          {activeView === "overview" ? (
            <>
              <section className={styles.metrics} aria-label="Platform overview">
                <MetricCard
                  icon={Users}
                  label="Registered users"
                  value={formatInteger(dashboard.stats.registeredUsers)}
                  detail={`${formatInteger(dashboard.stats.newUsers7d)} new in 7 days`}
                />
                <MetricCard
                  icon={Activity}
                  label="Current users"
                  value={formatInteger(dashboard.stats.currentUsers)}
                  detail={`${formatInteger(dashboard.stats.activeUsers7d)} active in 7 days`}
                  tone={dashboard.stats.currentUsers ? "good" : "default"}
                />
                <MetricCard
                  icon={MessageSquareText}
                  label="Messages"
                  value={formatInteger(dashboard.stats.messages)}
                  detail={`${formatInteger(dashboard.stats.messages24h)} in 24h`}
                />
                <MetricCard
                  icon={BarChart3}
                  label="Sessions"
                  value={formatInteger(dashboard.stats.sessions)}
                  detail={`${formatInteger(dashboard.stats.guestSessions)} guest sessions`}
                />
                <MetricCard
                  icon={BadgeDollarSign}
                  label="Paid users"
                  value={formatInteger(dashboard.stats.activeSubscriptions)}
                  detail={`${formatPercent(paidShare)} of registered users`}
                  tone={dashboard.stats.activeSubscriptions ? "good" : "default"}
                />
                <MetricCard
                  icon={FileText}
                  label="Documents"
                  value={formatInteger(dashboard.stats.documents)}
                  detail={`${formatBytes(dashboard.stats.documentBytes)} stored`}
                />
                <MetricCard
                  icon={HeartHandshake}
                  label="Avg feedback"
                  value={`${formatDecimal(dashboard.stats.averageRating)}/5`}
                  detail={`${formatInteger(dashboard.stats.feedback)} submissions`}
                />
                <MetricCard
                  icon={CircleAlert}
                  label="Pending requests"
                  value={formatInteger(dashboard.stats.pendingAccessRequests)}
                  detail={`${formatInteger(dashboard.stats.accessRequests)} total requests`}
                  tone={dashboard.stats.pendingAccessRequests ? "warn" : "good"}
                />
              </section>

              <section className={styles.statusGrid} aria-label="Platform health">
                <StatusCell
                  icon={Gauge}
                  label="Application"
                  status={health.app.status}
                  detail={`${health.app.runtime}, uptime ${formatInteger(
                    health.app.uptimeSeconds,
                  )}s`}
                />
                <StatusCell
                  icon={Sparkles}
                  label="AI engine"
                  status={health.llm.status}
                  detail={
                    health.llm.modelAvailable
                      ? `Model ready: ${health.llm.model}`
                      : health.llm.error || `Model missing: ${health.llm.model}`
                  }
                />
                <StatusCell
                  icon={Database}
                  label="PostgreSQL"
                  status={databaseStatus}
                  detail={
                    health.database.supabase.configured
                      ? databaseDetail
                      : "Supabase PostgreSQL is not configured."
                  }
                />
                <StatusCell
                  icon={BadgeDollarSign}
                  label="Billing"
                  status={health.stripe.status}
                  detail={
                    health.stripe.configured
                      ? "Stripe checkout and webhooks configured"
                      : `${health.stripe.missing.length} Stripe setting(s) missing or invalid`
                  }
                />
              </section>

              <section className={styles.twoColumn}>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2>Fourteen-day activity</h2>
                      <p>Daily signups, chats, and message volume.</p>
                    </div>
                    <span>
                      {formatInteger(dashboard.stats.messages7d)} messages in 7d
                    </span>
                  </div>
                  <div className={styles.timeline}>
                    {dashboard.daily.map((metric) => (
                      <article className={styles.dayBar} key={metric.date}>
                        <div className={styles.barStack} aria-hidden>
                          <span
                            className={styles.barMessages}
                            style={{
                              height: `${Math.max(
                                6,
                                (metric.messages / maxDailyMessages) * 100,
                              )}%`,
                            }}
                          />
                          <span
                            className={styles.barSessions}
                            style={{
                              height: `${Math.max(
                                5,
                                (metric.sessions / maxDailySessions) * 78,
                              )}%`,
                            }}
                          />
                          <span
                            className={styles.barSignups}
                            style={{
                              height: `${Math.max(
                                4,
                                (metric.signups / maxDailySignups) * 56,
                              )}%`,
                            }}
                          />
                        </div>
                        <strong>{formatShortDate(metric.date)}</strong>
                        <p>
                          {formatInteger(metric.signups)} new /{" "}
                          {formatInteger(metric.sessions)} chats /{" "}
                          {formatInteger(metric.messages)} msgs
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2>Plan and usage mix</h2>
                      <p>Subscription status, free limits, and saved workspace assets.</p>
                    </div>
                    <span>{formatInteger(dashboard.stats.freeUsers)} free users</span>
                  </div>
                  <div className={styles.summaryGrid}>
                    <article>
                      <span>Pro</span>
                      <strong>{formatInteger(dashboard.stats.proUsers)}</strong>
                      <p>{formatInteger(dashboard.stats.enterpriseUsers)} Enterprise</p>
                    </article>
                    <article>
                      <span>Trialing</span>
                      <strong>{formatInteger(dashboard.plans.trialing)}</strong>
                      <p>{formatInteger(dashboard.plans.canceled)} canceled</p>
                    </article>
                    <article>
                      <span>Usage tracked</span>
                      <strong>{formatInteger(dashboard.stats.trackedUsage)}</strong>
                      <p>{formatInteger(dashboard.stats.limitedFreeUsers)} limited</p>
                    </article>
                    <article>
                      <span>Starred</span>
                      <strong>{formatInteger(dashboard.stats.starredResponses)}</strong>
                      <p>{formatInteger(dashboard.stats.profiles)} profiles</p>
                    </article>
                    <article>
                      <span>Feedback signal</span>
                      <strong>{formatPercent(positiveResponses)}</strong>
                      <p>{formatInteger(dashboard.stats.responseActions)} response actions</p>
                    </article>
                    <article>
                      <span>Access approved</span>
                      <strong>{formatInteger(dashboard.stats.approvedAccessRequests)}</strong>
                      <p>{formatInteger(dashboard.stats.rejectedAccessRequests)} rejected</p>
                    </article>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeView === "users" ? (
            <>
              <section className={styles.metrics} aria-label="User overview">
                <MetricCard
                  icon={Users}
                  label="Known users"
                  value={formatInteger(dashboard.stats.knownUsers)}
                  detail={`${formatInteger(dashboard.stats.registeredUsers)} registered`}
                />
                <MetricCard
                  icon={Activity}
                  label="Active 24h"
                  value={formatInteger(dashboard.stats.activeUsers24h)}
                  detail={`${formatInteger(dashboard.stats.activeUsers7d)} active in 7 days`}
                  tone={dashboard.stats.activeUsers24h ? "good" : "default"}
                />
                <MetricCard
                  icon={FileText}
                  label="Documents"
                  value={formatInteger(dashboard.stats.documents)}
                  detail={`${formatBytes(dashboard.stats.documentBytes)} stored`}
                />
                <MetricCard
                  icon={BadgeDollarSign}
                  label="Paid accounts"
                  value={formatInteger(dashboard.stats.activeSubscriptions)}
                  detail={`${formatInteger(dashboard.stats.proUsers)} Pro / ${formatInteger(
                    dashboard.stats.enterpriseUsers,
                  )} Enterprise`}
                />
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Users</h2>
                    <p>Most recently active accounts with usage, documents, and plan state.</p>
                  </div>
                  <span>
                    {formatInteger(dashboard.stats.knownUsers)} known /{" "}
                    {formatInteger(dashboard.stats.activeUsers24h)} current
                  </span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Plan</th>
                        <th>Activity</th>
                        <th>Messages</th>
                        <th>Workspace</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.users.length ? (
                        dashboard.users.map((user) => {
                          const compactUserId = formatCompactUserId(user.id);
                          const displayName = user.displayName.trim();

                          return (
                            <tr key={user.id}>
                              <td>
                                <div className={styles.userCell}>
                                  <strong>
                                    {displayName || `User ${compactUserId}`}
                                  </strong>
                                  <span>ID {compactUserId}</span>
                                </div>
                              </td>
                              <td className={styles.emailCell}>
                                {user.email || "No email"}
                              </td>
                              <td>
                                <span
                                  className={`${styles.planPill} ${planClass(user.plan)}`}
                                >
                                  {user.plan}
                                </span>
                                <small>{user.subscriptionStatus}</small>
                              </td>
                              <td>
                                <strong>{formatRelative(user.lastActive)}</strong>
                                <small>Last sign-in {formatRelative(user.lastSignInAt)}</small>
                              </td>
                              <td>
                                <strong>{formatInteger(user.messages)}</strong>
                                <small>
                                  {formatInteger(user.userMessages)} user /{" "}
                                  {formatInteger(user.assistantMessages)} assistant
                                </small>
                              </td>
                              <td>
                                <strong>
                                  {formatInteger(user.sessions)} chats /{" "}
                                  {formatInteger(user.documents)} docs
                                </strong>
                                <small>
                                  {formatInteger(user.starredResponses)} starred /{" "}
                                  {formatBytes(user.documentBytes)}
                                </small>
                              </td>
                              <td>{formatDateTime(user.createdAt)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <EmptyRow colSpan={7} label="No registered or active users yet." />
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>User profile analyzer</h2>
                    <p>Recent prompt patterns used for ethical response personalization.</p>
                  </div>
                  <span>{formatInteger(userPatterns.length)} active profiles</span>
                </div>

                <div className={styles.patternGrid}>
                  {userPatterns.length ? (
                    userPatterns.map((pattern) => {
                      const identity = getUserIdentity(pattern.user_id);

                      return (
                        <article className={styles.patternCard} key={pattern.user_id}>
                          <div>
                            <span>User</span>
                            <strong>{identity.primary}</strong>
                            <small>{identity.secondary}</small>
                          </div>
                          <div className={styles.intentPills}>
                            {pattern.intentMix.slice(0, 3).map((intent) => (
                              <span key={intent.label}>
                                {intent.label} - {formatInteger(intent.count)}
                              </span>
                            ))}
                          </div>
                          <p className={styles.profileText}>{pattern.responseProfile}</p>
                          <div className={styles.topicList}>
                            {pattern.topTopics.slice(0, 6).map((topic) => (
                              <span key={topic}>{topic}</span>
                            ))}
                          </div>
                          <footer>
                            <span>{formatInteger(pattern.promptCount)} prompts</span>
                            <span>{formatInteger(pattern.averageWords)} avg words</span>
                          </footer>
                        </article>
                      );
                    })
                  ) : (
                    <p className={styles.emptyPanel}>
                      No signed-in prompt patterns yet. Profiles appear here after users
                      send saved chat prompts.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : null}

          {activeView === "activity" ? (
            <>
              <section className={styles.twoColumn}>
                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2>Fourteen-day activity</h2>
                      <p>Daily signups, chats, and message volume.</p>
                    </div>
                    <span>{formatInteger(dashboard.stats.messages7d)} messages in 7d</span>
                  </div>
                  <div className={styles.timeline}>
                    {dashboard.daily.map((metric) => (
                      <article className={styles.dayBar} key={metric.date}>
                        <div className={styles.barStack} aria-hidden>
                          <span
                            className={styles.barMessages}
                            style={{
                              height: `${Math.max(
                                6,
                                (metric.messages / maxDailyMessages) * 100,
                              )}%`,
                            }}
                          />
                          <span
                            className={styles.barSessions}
                            style={{
                              height: `${Math.max(
                                5,
                                (metric.sessions / maxDailySessions) * 78,
                              )}%`,
                            }}
                          />
                          <span
                            className={styles.barSignups}
                            style={{
                              height: `${Math.max(
                                4,
                                (metric.signups / maxDailySignups) * 56,
                              )}%`,
                            }}
                          />
                        </div>
                        <strong>{formatShortDate(metric.date)}</strong>
                        <p>
                          {formatInteger(metric.signups)} new /{" "}
                          {formatInteger(metric.sessions)} chats /{" "}
                          {formatInteger(metric.messages)} msgs
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2>Response actions</h2>
                      <p>Likes, dislikes, and comments from assistant answers.</p>
                    </div>
                    <span>{formatInteger(dashboard.stats.responseActions)} total</span>
                  </div>
                  <div className={styles.responseStats}>
                    <article>
                      <ThumbsUp size={16} aria-hidden />
                      <strong>{formatInteger(dashboard.stats.likedResponses)}</strong>
                      <span>Likes</span>
                    </article>
                    <article>
                      <ThumbsDown size={16} aria-hidden />
                      <strong>{formatInteger(dashboard.stats.dislikedResponses)}</strong>
                      <span>Dislikes</span>
                    </article>
                    <article>
                      <MessageSquareText size={16} aria-hidden />
                      <strong>{formatInteger(dashboard.stats.commentedResponses)}</strong>
                      <span>Comments</span>
                    </article>
                  </div>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>Reaction</th>
                          <th>Source</th>
                          <th>Comment</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responseActions.length ? (
                          responseActions.map((action) => (
                            <tr key={action.id}>
                              <td>{action.reaction}</td>
                              <td>Assistant response</td>
                              <td>{action.comment || "-"}</td>
                              <td>{formatDateTime(action.created_at)}</td>
                            </tr>
                          ))
                        ) : (
                          <EmptyRow colSpan={4} label="No response actions yet." />
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Recent chats</h2>
                    <p>Latest saved sessions across signed-in and guest activity.</p>
                  </div>
                  <span>{formatInteger(dashboard.stats.sessions24h)} active in 24h</span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>User</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.length ? (
                        sessions.map((session) => {
                          const identity = getUserIdentity(session.user_id);

                          return (
                            <tr key={session.id}>
                              <td>{session.title}</td>
                              <td>
                                <div className={styles.userCell}>
                                  <strong>{identity.primary}</strong>
                                  <span>{identity.secondary}</span>
                                </div>
                              </td>
                              <td>{formatDateTime(session.updated_at)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <EmptyRow colSpan={3} label="No chats yet." />
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {activeView === "access" ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Access requests</h2>
                  <p>Approve, reject, or reset user access state.</p>
                </div>
                <span>{formatInteger(dashboard.stats.pendingAccessRequests)} pending</span>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessRequests.length ? (
                      accessRequests.map((request) => (
                        <tr key={request.id}>
                          <td>{request.name}</td>
                          <td>{request.email}</td>
                          <td>
                            <span
                              className={`${styles.statusPill} ${accessStatusClass(
                                request.status,
                              )}`}
                            >
                              {request.status}
                            </span>
                          </td>
                          <td>{formatDateTime(request.created_at)}</td>
                          <td>
                            <form className={styles.actions} action={setAccessStatus}>
                              <input type="hidden" name="id" value={request.id} />
                              <button
                                type="submit"
                                name="status"
                                value="approved"
                                disabled={request.status === "approved"}
                              >
                                <CheckCircle2 size={14} aria-hidden />
                                Approve
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="rejected"
                                disabled={request.status === "rejected"}
                              >
                                <XCircle size={14} aria-hidden />
                                Reject
                              </button>
                              <button
                                type="submit"
                                name="status"
                                value="pending"
                                disabled={request.status === "pending"}
                              >
                                <RotateCcw size={14} aria-hidden />
                                Reset
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={5} label="No access requests yet." />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeView === "feedback" ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Feedback</h2>
                  <p>Recent user-submitted product feedback.</p>
                </div>
                <span>{formatDecimal(dashboard.stats.averageRating)}/5 avg</span>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Rating</th>
                      <th>Suggestion</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedback.length ? (
                      feedback.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.email}</td>
                          <td>{item.rating}/5</td>
                          <td>{item.suggestion}</td>
                          <td>{formatDateTime(item.created_at)}</td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow colSpan={5} label="No feedback yet." />
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeView === "messages" ? (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Saved message intelligence</h2>
                  <p>Continuous analysis of recent prompts and assistant responses.</p>
                </div>
                <span>
                  <UserCheck size={14} aria-hidden />
                  {formatInteger(dashboard.stats.userMessages)} user messages
                </span>
              </div>

              <div className={styles.insightGrid}>
                <article>
                  <span>Analyzed sample</span>
                  <strong>{formatInteger(messageInsights.savedMessages)}</strong>
                  <p>
                    {formatInteger(messageInsights.userMessages)} prompts /{" "}
                    {formatInteger(messageInsights.assistantMessages)} responses
                  </p>
                </article>
                <article>
                  <span>Active threads</span>
                  <strong>{formatInteger(messageInsights.activeSessionCount)}</strong>
                  <p>Distinct sessions in the recent message sample.</p>
                </article>
                <article>
                  <span>Question rate</span>
                  <strong>{formatPercent(messageInsights.questionRate)}</strong>
                  <p>{formatDecimal(messageInsights.averagePromptWords)} avg prompt terms</p>
                </article>
                <article>
                  <span>Friction signals</span>
                  <strong>{formatPercent(messageInsights.frictionRate)}</strong>
                  <p>Error, stuck, unavailable, or fix language.</p>
                </article>
              </div>

              <div className={styles.analysisGrid}>
                <article>
                  <div className={styles.analysisHeader}>
                    <BarChart3 size={16} aria-hidden />
                    <strong>Intent mix</strong>
                  </div>
                  <div className={styles.rankList}>
                    {messageInsights.intents.map((intent) => (
                      <div key={intent.label}>
                        <span>{intent.label}</span>
                        <strong>{formatInteger(intent.count)}</strong>
                        <meter min={0} max={1} value={intent.share} />
                      </div>
                    ))}
                  </div>
                </article>

                <article>
                  <div className={styles.analysisHeader}>
                    <Sparkles size={16} aria-hidden />
                    <strong>Topic clusters</strong>
                  </div>
                  <div className={styles.rankList}>
                    {messageInsights.topics.map((topic) => (
                      <div key={topic.label}>
                        <span>{topic.label}</span>
                        <strong>{formatInteger(topic.count)}</strong>
                        <meter min={0} max={1} value={topic.share} />
                      </div>
                    ))}
                  </div>
                </article>

                <article>
                  <div className={styles.analysisHeader}>
                    <MessageSquareText size={16} aria-hidden />
                    <strong>Admin readout</strong>
                  </div>
                  <ul className={styles.insightList}>
                    {messageInsights.insightBullets.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </article>
              </div>

              <div className={styles.termCloud} aria-label="Top prompt terms">
                {messageInsights.topTerms.length ? (
                  messageInsights.topTerms.map((term) => (
                    <span key={term.label}>
                      {term.label}
                      <small>{formatInteger(term.count)}</small>
                    </span>
                  ))
                ) : (
                  <p>No prompt terms available yet.</p>
                )}
              </div>

              <div className={styles.promptInsightList}>
                {messageInsights.recentPrompts.length ? (
                  messageInsights.recentPrompts.map((prompt) => (
                    <article key={prompt.id}>
                      <div>
                        <strong>{prompt.intent}</strong>
                        <span>{prompt.topic}</span>
                        {prompt.friction ? <small>Needs attention</small> : null}
                        <time>{formatDateTime(prompt.created_at)}</time>
                      </div>
                      <p>{prompt.content}</p>
                    </article>
                  ))
                ) : (
                  <p>No user prompts available yet.</p>
                )}
              </div>

              <div className={styles.messageList}>
                {messages.length ? (
                  messages.map((message) => (
                    <article key={message.id}>
                      <div>
                        <span>{message.role}</span>
                        <time>{formatDateTime(message.created_at)}</time>
                      </div>
                      <p>{message.content}</p>
                    </article>
                  ))
                ) : (
                  <p>No saved messages yet.</p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
