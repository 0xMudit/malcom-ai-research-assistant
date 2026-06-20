import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { User } from "@supabase/supabase-js";
import {
  buildSexualHealthFacts,
  targetSexualHealthFactCount,
} from "@/lib/sexual-health-facts";
import { planFromStripePriceId } from "@/lib/stripe";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  createSupabaseBackupAdminClients,
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/server";
import {
  deleteCache,
  getCacheJson,
  setCacheJson,
} from "@/lib/redis-cache";
import {
  analyzePromptPatterns,
  formatGfMemoMemory,
  type PromptPatternInput,
  type PromptPatternProfile,
} from "@/lib/user-patterns";

let supabaseFactsSeeded = false;
const reportedBackupErrors = new Set<string>();
const reportedSupabaseErrors = new Set<string>();
const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "malcom.sqlite");
let db: Database.Database | null = null;

export type StoredMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type StoredFeedback = {
  id: string;
  name: string;
  email: string;
  rating: number;
  suggestion: string;
  user_agent: string;
  created_at: string;
};

export type StoredAccessRequest = {
  id: string;
  name: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  user_agent: string;
  created_at: string;
};

export type StoredResponseFeedback = {
  id: string;
  message_id: string;
  reaction: "like" | "dislike" | "comment";
  comment: string;
  created_at: string;
};

export type StoredSession = {
  id: string;
  user_id?: string | null;
  title: string;
  folder?: string | null;
  tags?: string | null;
  pinned?: number | boolean | null;
  created_at: string;
  updated_at: string;
};

export type AppStats = {
  sessions: number;
  messages: number;
  feedback: number;
  averageRating: number;
  accessRequests: number;
  responseActions: number;
};

export type AdminUserPlan = PlanName | "unknown";

export type AdminUserSummary = {
  id: string;
  email: string;
  displayName: string;
  plan: AdminUserPlan;
  subscriptionStatus: string;
  sessions: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  documents: number;
  documentBytes: number;
  starredResponses: number;
  usageMessages: number;
  createdAt: string;
  lastActive: string;
  lastSignInAt: string;
};

export type AdminDailyMetric = {
  date: string;
  signups: number;
  sessions: number;
  messages: number;
  feedback: number;
  accessRequests: number;
};

export type AdminDashboardData = {
  generatedAt: string;
  storageMode: "supabase" | "sqlite";
  registrationSource: "supabase-auth" | "activity";
  stats: {
    registeredUsers: number;
    knownUsers: number;
    currentUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    newUsers24h: number;
    newUsers7d: number;
    sessions: number;
    sessions24h: number;
    sessions7d: number;
    guestSessions: number;
    messages: number;
    userMessages: number;
    assistantMessages: number;
    messages24h: number;
    messages7d: number;
    feedback: number;
    averageRating: number;
    accessRequests: number;
    pendingAccessRequests: number;
    approvedAccessRequests: number;
    rejectedAccessRequests: number;
    responseActions: number;
    likedResponses: number;
    dislikedResponses: number;
    commentedResponses: number;
    documents: number;
    documentBytes: number;
    starredResponses: number;
    profiles: number;
    trackedUsage: number;
    limitedFreeUsers: number;
    subscriptions: number;
    activeSubscriptions: number;
    proUsers: number;
    enterpriseUsers: number;
    freeUsers: number;
  };
  plans: {
    free: number;
    pro: number;
    enterprise: number;
    unknown: number;
    activePaid: number;
    trialing: number;
    canceled: number;
    pastDue: number;
    unpaid: number;
    none: number;
    other: number;
  };
  daily: AdminDailyMetric[];
  users: AdminUserSummary[];
};

export type SexualHealthFact = {
  id: number;
  fact: string;
};

export type StarredResponse = {
  id: string;
  user_id: string;
  message_id: string;
  session_id: string;
  content: string;
  created_at: string;
};

export type UserProfile = {
  user_id: string;
  display_name: string;
  memory: string;
  created_at: string;
  updated_at: string;
};

export type StoredDocument = {
  id: string;
  user_id: string;
  name: string;
  mime_type: string;
  size: number;
  content: string;
  summary: string;
  created_at: string;
};

export type PlanName = "free" | "pro" | "enterprise";

export type StoredUserUsage = {
  user_id: string;
  period_started_at: string;
  message_count: number;
  cooldown_until: string | null;
  updated_at: string;
};

export type UserPromptPattern = PromptPatternProfile & {
  user_id: string;
};

export type UserGfMemo = PromptPatternProfile & {
  user_id: string;
  summary: string;
  updated_at: string;
};

export type StoredUserSubscription = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: string;
  current_period_end: string | null;
  updated_at: string;
};

export type UserUsageStatus = {
  plan: PlanName;
  messagesUsed: number;
  messagesLimit: number | null;
  responsesRemaining: number | null;
  cooldownUntil: string | null;
  cooldownSecondsRemaining: number;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  isLimited: boolean;
};

export const freeMessageLimit = 100;
export const freeCooldownMs = 5 * 60 * 60 * 1000;

function userProfileCacheKey(userId: string) {
  return `user:${userId}:profile`;
}

function userGfMemoCacheKey(userId: string) {
  return `user:${userId}:gf_memo`;
}

function userUsageCacheKey(userId: string) {
  return `user:${userId}:usage`;
}

function userSubscriptionCacheKey(userId: string) {
  return `user:${userId}:subscription`;
}

function getDb() {
  if (db) {
    return db;
  }

  mkdirSync(dataDir, { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      folder TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      suggestion TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS response_feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike', 'comment')),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS access_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      user_agent TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS access_requests_email_idx
      ON access_requests (lower(email));

    CREATE TABLE IF NOT EXISTS sexual_health_facts (
      id INTEGER PRIMARY KEY,
      fact TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS starred_responses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      memory TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gf_memo (
      user_id TEXT PRIMARY KEY,
      memo_json TEXT NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL DEFAULT '',
      prompt_count INTEGER NOT NULL DEFAULT 0,
      last_prompt_excerpt TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS documents_user_id_created_at_idx
      ON documents (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_usage (
      user_id TEXT PRIMARY KEY,
      period_started_at TEXT NOT NULL DEFAULT (datetime('now')),
      message_count INTEGER NOT NULL DEFAULT 0,
      cooldown_until TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL DEFAULT '',
      stripe_subscription_id TEXT NOT NULL DEFAULT '',
      stripe_price_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'none',
      current_period_end TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS user_subscriptions_customer_idx
      ON user_subscriptions (stripe_customer_id);

    CREATE INDEX IF NOT EXISTS user_subscriptions_subscription_idx
      ON user_subscriptions (stripe_subscription_id);
  `);

  const sessionColumns = db
    .prepare("PRAGMA table_info(chat_sessions)")
    .all() as { name: string }[];

  if (!sessionColumns.some((column) => column.name === "user_id")) {
    db.exec("ALTER TABLE chat_sessions ADD COLUMN user_id TEXT");
  }

  for (const [name, sql] of [
    [
      "folder",
      "ALTER TABLE chat_sessions ADD COLUMN folder TEXT NOT NULL DEFAULT ''",
    ],
    ["tags", "ALTER TABLE chat_sessions ADD COLUMN tags TEXT NOT NULL DEFAULT ''"],
    [
      "pinned",
      "ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
    ],
  ] as const) {
    if (!sessionColumns.some((column) => column.name === name)) {
      db.exec(sql);
    }
  }

  seedSexualHealthFacts(db);

  return db;
}

function seedSexualHealthFacts(database: Database.Database) {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM sexual_health_facts")
    .get() as { count: number } | undefined;

  if (Number(row?.count || 0) >= targetSexualHealthFactCount) {
    return;
  }

  const insert = database.prepare(
    "INSERT OR IGNORE INTO sexual_health_facts (id, fact) VALUES (?, ?)",
  );
  const seedFacts = buildSexualHealthFacts();
  const insertFacts = database.transaction(() => {
    for (const [index, fact] of seedFacts.entries()) {
      insert.run(index + 1, fact);
    }
  });

  insertFacts();
}

function shouldUseSupabase() {
  return Boolean(getSupabasePublicConfig() && hasSupabaseAdminConfig());
}

export function getLocalDatabaseHealth() {
  const database = getDb();
  const tables = [
    "chat_sessions",
    "chat_messages",
    "feedback",
    "response_feedback",
    "access_requests",
    "sexual_health_facts",
    "starred_responses",
    "user_profiles",
    "gf_memo",
    "documents",
    "user_usage",
    "user_subscriptions",
  ];
  const counts = Object.fromEntries(
    tables.map((table) => {
      const row = database
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get() as { count: number } | undefined;

      return [table, Number(row?.count || 0)];
    }),
  );

  return {
    ok: true,
    path: dbPath,
    counts,
  };
}

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function writeToSupabaseBackups(
  action: string,
  operation: (client: SupabaseAdminClient) => Promise<void>,
) {
  const backups = createSupabaseBackupAdminClients();

  await Promise.all(
    backups.map(async (client, index) => {
      try {
        await operation(client);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const key = `${action}:${index}:${message}`;

        if (!reportedBackupErrors.has(key)) {
          reportedBackupErrors.add(key);
          console.error(`Supabase backup ${action} failed: ${message}`);
        }
      }
    }),
  );
}

async function writeToSupabase(
  action: string,
  operation: (client: SupabaseAdminClient) => Promise<void>,
) {
  const primary = createSupabaseAdminClient();

  try {
    await operation(primary);
  } catch (error) {
    reportSupabaseError(action, error);
    throw error;
  }

  await writeToSupabaseBackups(action, operation);
}

function reportSupabaseError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${action}:${message}`;

  if (reportedSupabaseErrors.has(key)) {
    return;
  }

  reportedSupabaseErrors.add(key);
  console.error(`Supabase ${action} failed; using local fallback. ${message}`);
}

function isMissingGfMemoSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /gf_memo|Could not find the table|schema cache|relation .* does not exist/i.test(
    message,
  );
}

export function getSupabaseFallbackReason() {
  return null;
}

function throwOnSupabaseError(error: unknown) {
  if (error) {
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "Supabase request failed.";

    throw new Error(message);
  }
}

async function ensureSupabaseFactsSeeded() {
  if (supabaseFactsSeeded) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("sexual_health_facts")
    .select("id", { count: "exact", head: true });

  throwOnSupabaseError(error);

  if (Number(count || 0) >= targetSexualHealthFactCount) {
    supabaseFactsSeeded = true;
    return;
  }

  const rows = buildSexualHealthFacts().map((fact, index) => ({
    id: index + 1,
    fact,
  }));
  const { error: insertError } = await supabase
    .from("sexual_health_facts")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  throwOnSupabaseError(insertError);
  supabaseFactsSeeded = true;
}

export async function saveChatMessage(input: {
  id: string;
  sessionId: string;
  userId?: string | null;
  role: "user" | "assistant";
  content: string;
  title?: string;
}) {
  const title = (input.title || input.content).slice(0, 80).trim() || "Untitled";
  const updatedAt = new Date().toISOString();

  await writeToSupabase("saveChatMessage", async (supabase) => {
    const { error: sessionError } = await supabase
      .from("chat_sessions")
      .upsert(
        {
          id: input.sessionId,
          user_id: input.userId || null,
          title,
          updated_at: updatedAt,
        },
        { onConflict: "id" },
      );

    throwOnSupabaseError(sessionError);

    const { error: messageError } = await supabase
      .from("chat_messages")
      .upsert(
        {
          id: input.id,
          session_id: input.sessionId,
          role: input.role,
          content: input.content,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );

    throwOnSupabaseError(messageError);
  });
}

export async function saveFeedback(input: {
  id: string;
  name: string;
  email: string;
  rating: number;
  suggestion: string;
  userAgent: string;
}) {
  await writeToSupabase("saveFeedback", async (supabase) => {
    const { error } = await supabase.from("feedback").insert({
      id: input.id,
      name: input.name,
      email: input.email,
      rating: input.rating,
      suggestion: input.suggestion,
      user_agent: input.userAgent,
    });

    throwOnSupabaseError(error);
  });
}

export async function saveAccessRequest(input: {
  id: string;
  name: string;
  email: string;
  userAgent: string;
}) {
  await writeToSupabase("saveAccessRequest", async (supabase) => {
    const { error } = await supabase
      .from("access_requests")
      .upsert(
        {
          id: input.id,
          name: input.name,
          email: input.email.toLowerCase(),
          user_agent: input.userAgent,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );

    throwOnSupabaseError(error);
  });
}

export async function updateAccessRequestStatus(input: {
  id: string;
  status: "pending" | "approved" | "rejected";
}) {
  await writeToSupabase("updateAccessRequestStatus", async (supabase) => {
    const { error } = await supabase
      .from("access_requests")
      .update({ status: input.status })
      .eq("id", input.id);

    throwOnSupabaseError(error);
  });
}

export async function saveResponseFeedback(input: {
  id: string;
  messageId: string;
  reaction: "like" | "dislike" | "comment";
  comment?: string;
}) {
  await writeToSupabase("saveResponseFeedback", async (supabase) => {
    const { error } = await supabase.from("response_feedback").insert({
      id: input.id,
      message_id: input.messageId,
      reaction: input.reaction,
      comment: input.comment || "",
    });

    throwOnSupabaseError(error);
  });
}

async function getSupabaseCount(table: string) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  throwOnSupabaseError(error);
  return Number(count || 0);
}

export async function getStats(): Promise<AppStats> {
  try {
    const supabase = createSupabaseAdminClient();
    const [
      sessions,
      messages,
      feedback,
      accessRequests,
      responseActions,
      ratings,
    ] = await Promise.all([
      getSupabaseCount("chat_sessions"),
      getSupabaseCount("chat_messages"),
      getSupabaseCount("feedback"),
      getSupabaseCount("access_requests"),
      getSupabaseCount("response_feedback"),
      supabase.from("feedback").select("rating"),
    ]);

    throwOnSupabaseError(ratings.error);

    const ratingRows = ratings.data || [];
    const averageRating = ratingRows.length
      ? ratingRows.reduce((total, row) => total + Number(row.rating || 0), 0) /
        ratingRows.length
      : 0;

    return {
      sessions,
      messages,
      feedback,
      averageRating,
      accessRequests,
      responseActions,
    };
  } catch (error) {
    reportSupabaseError("getStats", error);
  }

  const database = getDb();
  const row = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM chat_sessions) AS sessions,
        (SELECT COUNT(*) FROM chat_messages) AS messages,
        (SELECT COUNT(*) FROM feedback) AS feedback,
        COALESCE((SELECT AVG(rating) FROM feedback), 0) AS averageRating,
        (SELECT COUNT(*) FROM access_requests) AS accessRequests,
        (SELECT COUNT(*) FROM response_feedback) AS responseActions`,
    )
    .get() as AppStats | undefined;

  return {
    sessions: Number(row?.sessions || 0),
    messages: Number(row?.messages || 0),
    feedback: Number(row?.feedback || 0),
    averageRating: Number(row?.averageRating || 0),
    accessRequests: Number(row?.accessRequests || 0),
    responseActions: Number(row?.responseActions || 0),
  };
}

/*
 * The following SQLite fallback implementation was removed when Supabase
 * PostgreSQL became the required runtime database. The app now fails loudly on
 * Supabase schema/configuration errors so production data cannot split across
 * two stores.
 */
/*
export async function saveFeedback(input: {
  id: string;
  name: string;
  email: string;
  rating: number;
  suggestion: string;
  userAgent: string;
}) {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("feedback").insert({
        id: input.id,
        name: input.name,
        email: input.email,
        rating: input.rating,
        suggestion: input.suggestion,
        user_agent: input.userAgent,
      });

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveFeedback", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO feedback (id, name, email, rating, suggestion, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.name,
      input.email,
      input.rating,
      input.suggestion,
      input.userAgent,
    );
}

export async function saveAccessRequest(input: {
  id: string;
  name: string;
  email: string;
  userAgent: string;
}) {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase
        .from("access_requests")
        .upsert(
          {
            id: input.id,
            name: input.name,
            email: input.email.toLowerCase(),
            user_agent: input.userAgent,
            status: "pending",
            created_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        );

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveAccessRequest", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO access_requests (id, name, email, user_agent)
       VALUES (?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET
         name = excluded.name,
         user_agent = excluded.user_agent,
         status = 'pending',
         created_at = datetime('now')`,
    )
    .run(input.id, input.name, input.email, input.userAgent);
}

export async function updateAccessRequestStatus(input: {
  id: string;
  status: "pending" | "approved" | "rejected";
}) {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase
        .from("access_requests")
        .update({ status: input.status })
        .eq("id", input.id);

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("updateAccessRequestStatus", error);
    }
  }

  getDb()
    .prepare("UPDATE access_requests SET status = ? WHERE id = ?")
    .run(input.status, input.id);
}

export async function saveResponseFeedback(input: {
  id: string;
  messageId: string;
  reaction: "like" | "dislike" | "comment";
  comment?: string;
}) {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { error } = await supabase.from("response_feedback").insert({
        id: input.id,
        message_id: input.messageId,
        reaction: input.reaction,
        comment: input.comment || "",
      });

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveResponseFeedback", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO response_feedback (id, message_id, reaction, comment)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.id, input.messageId, input.reaction, input.comment || "");
}

async function getSupabaseCount(table: string) {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  throwOnSupabaseError(error);
  return Number(count || 0);
}

export async function getStats(): Promise<AppStats> {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const [
        sessions,
        messages,
        feedback,
        accessRequests,
        responseActions,
        ratings,
      ] = await Promise.all([
        getSupabaseCount("chat_sessions"),
        getSupabaseCount("chat_messages"),
        getSupabaseCount("feedback"),
        getSupabaseCount("access_requests"),
        getSupabaseCount("response_feedback"),
        supabase.from("feedback").select("rating"),
      ]);

      throwOnSupabaseError(ratings.error);

      const ratingRows = ratings.data || [];
      const averageRating = ratingRows.length
        ? ratingRows.reduce(
            (total, row) => total + Number(row.rating || 0),
            0,
          ) / ratingRows.length
        : 0;

      return {
        sessions,
        messages,
        feedback,
        averageRating,
        accessRequests,
        responseActions,
      };
    } catch (error) {
      reportSupabaseError("getStats", error);
    }
  }

  const database = getDb();
  const row = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM chat_sessions) AS sessions,
        (SELECT COUNT(*) FROM chat_messages) AS messages,
        (SELECT COUNT(*) FROM feedback) AS feedback,
        COALESCE((SELECT AVG(rating) FROM feedback), 0) AS averageRating,
        (SELECT COUNT(*) FROM access_requests) AS accessRequests,
        (SELECT COUNT(*) FROM response_feedback) AS responseActions`,
    )
    .get() as AppStats | undefined;

  return {
    sessions: Number(row?.sessions || 0),
    messages: Number(row?.messages || 0),
    feedback: Number(row?.feedback || 0),
    averageRating: Number(row?.averageRating || 0),
    accessRequests: Number(row?.accessRequests || 0),
    responseActions: Number(row?.responseActions || 0),
  };
}
*/

const adminActivityRowLimit = 5000;
const adminAuthUserLimit = 10000;
const dayMs = 24 * 60 * 60 * 1000;

type AdminAuthUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string;
};

type AdminSessionActivity = {
  id: string;
  user_id: string | null;
  title?: string | null;
  created_at: string;
  updated_at: string;
};

type AdminMessageActivity = {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  created_at: string;
};

type AdminDocumentActivity = {
  id: string;
  user_id: string;
  size: number;
  created_at: string;
};

type AdminStarredActivity = {
  id: string;
  user_id: string;
  created_at: string;
};

type AdminProfileActivity = {
  user_id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

type AdminUsageActivity = StoredUserUsage;

type AdminActivityInput = {
  storageMode: "supabase" | "sqlite";
  registrationSource: "supabase-auth" | "activity";
  baseStats: AppStats;
  authUsers: AdminAuthUser[];
  sessions: AdminSessionActivity[];
  messages: AdminMessageActivity[];
  documents: AdminDocumentActivity[];
  starred: AdminStarredActivity[];
  profiles: AdminProfileActivity[];
  usage: AdminUsageActivity[];
  subscriptions: StoredUserSubscription[];
  feedbackActivity: Array<{ created_at: string }>;
  accessActivity: Array<{ created_at: string; status?: string | null }>;
  responseActivity: Array<{ reaction: string }>;
  exactCounts: {
    sessions24h: number;
    sessions7d: number;
    guestSessions: number;
    userMessages: number;
    assistantMessages: number;
    messages24h: number;
    messages7d: number;
    documents: number;
    starredResponses: number;
    profiles: number;
    trackedUsage: number;
    subscriptions: number;
  };
  recentUserLimit: number;
};

type AdminUserAccumulator = {
  id: string;
  email: string;
  displayName: string;
  plan: AdminUserPlan;
  subscriptionStatus: string;
  sessions: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  documents: number;
  documentBytes: number;
  starredResponses: number;
  usageMessages: number;
  createdAt: string;
  lastActive: string;
  lastSignInAt: string;
};

type SupabaseCountFilter =
  | { method: "eq" | "gte"; column: string; value: string }
  | { method: "is"; column: string; value: null };

function timestampOf(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isWithin(value: string | null | undefined, since: number) {
  const timestamp = timestampOf(value);
  return timestamp > 0 && timestamp >= since;
}

function dateKey(value: string | null | undefined) {
  const timestamp = timestampOf(value);

  if (!timestamp) {
    return "";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

function createDailyMetrics(days = 14) {
  const map = new Map<string, AdminDailyMetric>();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  for (let index = 0; index < days; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    map.set(key, {
      date: key,
      signups: 0,
      sessions: 0,
      messages: 0,
      feedback: 0,
      accessRequests: 0,
    });
  }

  return map;
}

function incrementDaily(
  daily: Map<string, AdminDailyMetric>,
  value: string | null | undefined,
  key: keyof Omit<AdminDailyMetric, "date">,
) {
  const metric = daily.get(dateKey(value));

  if (metric) {
    metric[key] += 1;
  }
}

function readMetadataString(metadata: unknown, keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const record = metadata as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function makeAdminAuthUser(user: User): AdminAuthUser {
  return {
    id: user.id,
    email: user.email || "",
    displayName: readMetadataString(user.user_metadata, [
      "display_name",
      "name",
      "full_name",
    ]),
    createdAt: user.created_at || "",
    lastSignInAt: user.last_sign_in_at || "",
  };
}

async function listSupabaseAuthUsers(limit = adminAuthUserLimit) {
  const supabase = createSupabaseAdminClient();
  const users: AdminAuthUser[] = [];
  const perPage = 1000;

  for (let page = 1; users.length < limit; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: Math.min(perPage, limit - users.length),
    });

    throwOnSupabaseError(error);

    const pageUsers = data.users || [];
    users.push(...pageUsers.map(makeAdminAuthUser));

    if (pageUsers.length < perPage) {
      break;
    }
  }

  return users;
}

async function countSupabaseRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
  filters: SupabaseCountFilter[] = [],
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  for (const filter of filters) {
    if (filter.method === "eq") {
      query = query.eq(filter.column, filter.value);
    } else if (filter.method === "gte") {
      query = query.gte(filter.column, filter.value);
    } else {
      query = query.is(filter.column, filter.value);
    }
  }

  const { count, error } = await query;
  throwOnSupabaseError(error);
  return Number(count || 0);
}

function getAdminUser(
  users: Map<string, AdminUserAccumulator>,
  userId: string,
) {
  const id = userId.trim();

  if (!id) {
    return null;
  }

  const existing = users.get(id);

  if (existing) {
    return existing;
  }

  const user: AdminUserAccumulator = {
    id,
    email: "",
    displayName: "",
    plan: "free",
    subscriptionStatus: "none",
    sessions: 0,
    messages: 0,
    userMessages: 0,
    assistantMessages: 0,
    documents: 0,
    documentBytes: 0,
    starredResponses: 0,
    usageMessages: 0,
    createdAt: "",
    lastActive: "",
    lastSignInAt: "",
  };

  users.set(id, user);
  return user;
}

function setEarliestCreatedAt(user: AdminUserAccumulator, value: string) {
  if (!value) {
    return;
  }

  if (!user.createdAt || timestampOf(value) < timestampOf(user.createdAt)) {
    user.createdAt = value;
  }
}

function setLatestActivity(user: AdminUserAccumulator, value: string) {
  if (!value) {
    return;
  }

  if (!user.lastActive || timestampOf(value) > timestampOf(user.lastActive)) {
    user.lastActive = value;
  }
}

function applySubscriptionToUser(
  user: AdminUserAccumulator,
  subscription: StoredUserSubscription,
) {
  const active = isActiveSubscriptionStatus(subscription.status);

  user.subscriptionStatus = subscription.status || "none";
  user.plan = active ? planFromStripePriceId(subscription.stripe_price_id) : "free";
  setLatestActivity(user, subscription.updated_at);
}

function buildAdminDashboardSnapshot(input: AdminActivityInput): AdminDashboardData {
  const now = Date.now();
  const since24h = now - dayMs;
  const since7d = now - 7 * dayMs;
  const daily = createDailyMetrics();
  const users = new Map<string, AdminUserAccumulator>();

  for (const authUser of input.authUsers) {
    const user = getAdminUser(users, authUser.id);

    if (!user) {
      continue;
    }

    user.email = authUser.email;
    user.displayName = authUser.displayName;
    user.lastSignInAt = authUser.lastSignInAt;
    setEarliestCreatedAt(user, authUser.createdAt);
    setLatestActivity(user, authUser.lastSignInAt || authUser.createdAt);
    incrementDaily(daily, authUser.createdAt, "signups");
  }

  for (const session of input.sessions) {
    incrementDaily(daily, session.created_at, "sessions");

    const user = getAdminUser(users, session.user_id || "");

    if (!user) {
      continue;
    }

    user.sessions += 1;
    setEarliestCreatedAt(user, session.created_at);
    setLatestActivity(user, session.updated_at || session.created_at);
  }

  for (const message of input.messages) {
    incrementDaily(daily, message.created_at, "messages");

    const user = getAdminUser(users, message.user_id);

    if (!user) {
      continue;
    }

    user.messages += 1;

    if (message.role === "user") {
      user.userMessages += 1;
    } else {
      user.assistantMessages += 1;
    }

    setLatestActivity(user, message.created_at);
  }

  for (const document of input.documents) {
    const user = getAdminUser(users, document.user_id);

    if (!user) {
      continue;
    }

    user.documents += 1;
    user.documentBytes += Math.max(0, Number(document.size || 0));
    setEarliestCreatedAt(user, document.created_at);
    setLatestActivity(user, document.created_at);
  }

  for (const response of input.starred) {
    const user = getAdminUser(users, response.user_id);

    if (!user) {
      continue;
    }

    user.starredResponses += 1;
    setLatestActivity(user, response.created_at);
  }

  for (const profile of input.profiles) {
    const user = getAdminUser(users, profile.user_id);

    if (!user) {
      continue;
    }

    if (!user.displayName && profile.display_name) {
      user.displayName = profile.display_name;
    }

    setEarliestCreatedAt(user, profile.created_at);
    setLatestActivity(user, profile.updated_at || profile.created_at);
  }

  for (const usage of input.usage) {
    const user = getAdminUser(users, usage.user_id);

    if (!user) {
      continue;
    }

    user.usageMessages = Math.max(0, Number(usage.message_count || 0));
    setLatestActivity(user, usage.updated_at);
  }

  const plans = {
    free: 0,
    pro: 0,
    enterprise: 0,
    unknown: 0,
    activePaid: 0,
    trialing: 0,
    canceled: 0,
    pastDue: 0,
    unpaid: 0,
    none: 0,
    other: 0,
  };

  for (const subscription of input.subscriptions) {
    const normalized = normalizeSubscriptionRow(
      subscription.user_id,
      subscription,
    );
    const status = normalized.status;

    if (status === "trialing") {
      plans.trialing += 1;
    } else if (status === "canceled") {
      plans.canceled += 1;
    } else if (status === "past_due") {
      plans.pastDue += 1;
    } else if (status === "unpaid") {
      plans.unpaid += 1;
    } else if (status === "none") {
      plans.none += 1;
    } else if (status && status !== "active") {
      plans.other += 1;
    }

    const user = getAdminUser(users, normalized.user_id);

    if (user) {
      applySubscriptionToUser(user, normalized);
    }

    if (!isActiveSubscriptionStatus(status)) {
      continue;
    }

    const plan = planFromStripePriceId(normalized.stripe_price_id);
    plans.activePaid += 1;

    if (plan === "enterprise") {
      plans.enterprise += 1;
    } else if (plan === "pro") {
      plans.pro += 1;
    } else {
      plans.free += 1;
    }
  }

  for (const feedback of input.feedbackActivity) {
    incrementDaily(daily, feedback.created_at, "feedback");
  }

  const accessCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };

  for (const access of input.accessActivity) {
    incrementDaily(daily, access.created_at, "accessRequests");

    if (access.status === "approved") {
      accessCounts.approved += 1;
    } else if (access.status === "rejected") {
      accessCounts.rejected += 1;
    } else {
      accessCounts.pending += 1;
    }
  }

  const responseCounts = {
    like: 0,
    dislike: 0,
    comment: 0,
  };

  for (const response of input.responseActivity) {
    if (response.reaction === "like") {
      responseCounts.like += 1;
    } else if (response.reaction === "dislike") {
      responseCounts.dislike += 1;
    } else if (response.reaction === "comment") {
      responseCounts.comment += 1;
    }
  }

  const userRows = [...users.values()];

  if (input.registrationSource === "activity") {
    for (const user of userRows) {
      incrementDaily(daily, user.createdAt, "signups");
    }
  }

  const registeredUsers =
    input.registrationSource === "supabase-auth"
      ? input.authUsers.length
      : userRows.length;
  const knownUsers = userRows.length;
  const activeUsers24h = userRows.filter((user) =>
    isWithin(user.lastActive || user.lastSignInAt, since24h),
  ).length;
  const activeUsers7d = userRows.filter((user) =>
    isWithin(user.lastActive || user.lastSignInAt, since7d),
  ).length;
  const newUsers24h = userRows.filter((user) =>
    isWithin(user.createdAt, since24h),
  ).length;
  const newUsers7d = userRows.filter((user) =>
    isWithin(user.createdAt, since7d),
  ).length;
  const limitedFreeUsers = input.usage.filter((usage) => {
    const user = users.get(usage.user_id);

    if (user?.plan === "pro" || user?.plan === "enterprise") {
      return false;
    }

    const count = Math.max(0, Number(usage.message_count || 0));
    return count >= freeMessageLimit || isWithin(usage.cooldown_until, now);
  }).length;
  const documentBytes = input.documents.reduce(
    (total, document) => total + Math.max(0, Number(document.size || 0)),
    0,
  );
  const activeSubscriptions = plans.activePaid;
  const freeUsers = Math.max(0, registeredUsers - activeSubscriptions);

  plans.free = freeUsers;
  plans.unknown = Math.max(0, knownUsers - registeredUsers);

  return {
    generatedAt: new Date().toISOString(),
    storageMode: input.storageMode,
    registrationSource: input.registrationSource,
    stats: {
      registeredUsers,
      knownUsers,
      currentUsers: activeUsers24h,
      activeUsers24h,
      activeUsers7d,
      newUsers24h,
      newUsers7d,
      sessions: input.baseStats.sessions,
      sessions24h: input.exactCounts.sessions24h,
      sessions7d: input.exactCounts.sessions7d,
      guestSessions: input.exactCounts.guestSessions,
      messages: input.baseStats.messages,
      userMessages: input.exactCounts.userMessages,
      assistantMessages: input.exactCounts.assistantMessages,
      messages24h: input.exactCounts.messages24h,
      messages7d: input.exactCounts.messages7d,
      feedback: input.baseStats.feedback,
      averageRating: input.baseStats.averageRating,
      accessRequests: input.baseStats.accessRequests,
      pendingAccessRequests: accessCounts.pending,
      approvedAccessRequests: accessCounts.approved,
      rejectedAccessRequests: accessCounts.rejected,
      responseActions: input.baseStats.responseActions,
      likedResponses: responseCounts.like,
      dislikedResponses: responseCounts.dislike,
      commentedResponses: responseCounts.comment,
      documents: input.exactCounts.documents,
      documentBytes,
      starredResponses: input.exactCounts.starredResponses,
      profiles: input.exactCounts.profiles,
      trackedUsage: input.exactCounts.trackedUsage,
      limitedFreeUsers,
      subscriptions: input.exactCounts.subscriptions,
      activeSubscriptions,
      proUsers: plans.pro,
      enterpriseUsers: plans.enterprise,
      freeUsers,
    },
    plans,
    daily: [...daily.values()],
    users: userRows
      .sort(
        (a, b) =>
          timestampOf(b.lastActive || b.lastSignInAt || b.createdAt) -
          timestampOf(a.lastActive || a.lastSignInAt || a.createdAt),
      )
      .slice(0, input.recentUserLimit),
  };
}

async function getSupabaseAdminDashboardData(
  recentUserLimit: number,
): Promise<AdminDashboardData> {
  const supabase = createSupabaseAdminClient();
  const since24h = new Date(Date.now() - dayMs).toISOString();
  const since7d = new Date(Date.now() - 7 * dayMs).toISOString();
  const recentWindow = new Date(Date.now() - 13 * dayMs).toISOString();
  let authUsers: AdminAuthUser[] = [];

  try {
    authUsers = await listSupabaseAuthUsers();
  } catch (error) {
    reportSupabaseError("listSupabaseAuthUsers", error);
  }

  const [
    baseStats,
    sessionsResult,
    messagesResult,
    documentsResult,
    starredResult,
    profilesResult,
    usageResult,
    subscriptionsResult,
    feedbackActivityResult,
    accessActivityResult,
    responseActivityResult,
    sessions24h,
    sessions7d,
    guestSessions,
    userMessages,
    assistantMessages,
    messages24h,
    messages7d,
    documents,
    starredResponses,
    profiles,
    trackedUsage,
    subscriptions,
  ] = await Promise.all([
    getStats(),
    supabase
      .from("chat_sessions")
      .select("id, user_id, title, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("chat_messages")
      .select("id, role, created_at, chat_sessions!inner(user_id)")
      .order("created_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("documents")
      .select("id, user_id, size, created_at")
      .order("created_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("starred_responses")
      .select("id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("user_profiles")
      .select("user_id, display_name, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("user_usage")
      .select("user_id, period_started_at, message_count, cooldown_until, updated_at")
      .order("updated_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("user_subscriptions")
      .select(
        "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(adminActivityRowLimit),
    supabase
      .from("feedback")
      .select("created_at")
      .gte("created_at", recentWindow)
      .limit(adminActivityRowLimit),
    supabase
      .from("access_requests")
      .select("created_at, status")
      .gte("created_at", recentWindow)
      .limit(adminActivityRowLimit),
    supabase
      .from("response_feedback")
      .select("reaction")
      .limit(adminActivityRowLimit),
    countSupabaseRows(supabase, "chat_sessions", [
      { method: "gte", column: "updated_at", value: since24h },
    ]),
    countSupabaseRows(supabase, "chat_sessions", [
      { method: "gte", column: "updated_at", value: since7d },
    ]),
    countSupabaseRows(supabase, "chat_sessions", [
      { method: "is", column: "user_id", value: null },
    ]),
    countSupabaseRows(supabase, "chat_messages", [
      { method: "eq", column: "role", value: "user" },
    ]),
    countSupabaseRows(supabase, "chat_messages", [
      { method: "eq", column: "role", value: "assistant" },
    ]),
    countSupabaseRows(supabase, "chat_messages", [
      { method: "gte", column: "created_at", value: since24h },
    ]),
    countSupabaseRows(supabase, "chat_messages", [
      { method: "gte", column: "created_at", value: since7d },
    ]),
    countSupabaseRows(supabase, "documents"),
    countSupabaseRows(supabase, "starred_responses"),
    countSupabaseRows(supabase, "user_profiles"),
    countSupabaseRows(supabase, "user_usage"),
    countSupabaseRows(supabase, "user_subscriptions"),
  ]);

  for (const result of [
    sessionsResult,
    messagesResult,
    documentsResult,
    starredResult,
    profilesResult,
    usageResult,
    subscriptionsResult,
    feedbackActivityResult,
    accessActivityResult,
    responseActivityResult,
  ]) {
    throwOnSupabaseError(result.error);
  }

  const messages = ((messagesResult.data || []) as Array<Record<string, unknown>>)
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : "",
      user_id: readJoinedUserId(row.chat_sessions),
      role: row.role === "assistant" ? "assistant" : "user",
      created_at: typeof row.created_at === "string" ? row.created_at : "",
    }))
    .filter((row): row is AdminMessageActivity => Boolean(row.id));

  return buildAdminDashboardSnapshot({
    storageMode: "supabase",
    registrationSource: authUsers.length ? "supabase-auth" : "activity",
    baseStats,
    authUsers,
    sessions: (sessionsResult.data || []) as AdminSessionActivity[],
    messages,
    documents: (documentsResult.data || []) as AdminDocumentActivity[],
    starred: (starredResult.data || []) as AdminStarredActivity[],
    profiles: (profilesResult.data || []) as AdminProfileActivity[],
    usage: (usageResult.data || []) as AdminUsageActivity[],
    subscriptions: (subscriptionsResult.data || []) as StoredUserSubscription[],
    feedbackActivity: (feedbackActivityResult.data || []) as Array<{
      created_at: string;
    }>,
    accessActivity: (accessActivityResult.data || []) as Array<{
      created_at: string;
      status?: string | null;
    }>,
    responseActivity: (responseActivityResult.data || []) as Array<{
      reaction: string;
    }>,
    exactCounts: {
      sessions24h,
      sessions7d,
      guestSessions,
      userMessages,
      assistantMessages,
      messages24h,
      messages7d,
      documents,
      starredResponses,
      profiles,
      trackedUsage,
      subscriptions,
    },
    recentUserLimit,
  });
}

function getSqliteAdminDashboardData(
  recentUserLimit: number,
): AdminDashboardData {
  const database = getDb();
  const baseStatsRow = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM chat_sessions) AS sessions,
        (SELECT COUNT(*) FROM chat_messages) AS messages,
        (SELECT COUNT(*) FROM feedback) AS feedback,
        COALESCE((SELECT AVG(rating) FROM feedback), 0) AS averageRating,
        (SELECT COUNT(*) FROM access_requests) AS accessRequests,
        (SELECT COUNT(*) FROM response_feedback) AS responseActions`,
    )
    .get() as AppStats;
  const countRow = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM chat_sessions WHERE datetime(updated_at) >= datetime('now', '-1 day')) AS sessions24h,
        (SELECT COUNT(*) FROM chat_sessions WHERE datetime(updated_at) >= datetime('now', '-7 day')) AS sessions7d,
        (SELECT COUNT(*) FROM chat_sessions WHERE COALESCE(user_id, '') = '') AS guestSessions,
        (SELECT COUNT(*) FROM chat_messages WHERE role = 'user') AS userMessages,
        (SELECT COUNT(*) FROM chat_messages WHERE role = 'assistant') AS assistantMessages,
        (SELECT COUNT(*) FROM chat_messages WHERE datetime(created_at) >= datetime('now', '-1 day')) AS messages24h,
        (SELECT COUNT(*) FROM chat_messages WHERE datetime(created_at) >= datetime('now', '-7 day')) AS messages7d,
        (SELECT COUNT(*) FROM documents) AS documents,
        (SELECT COUNT(*) FROM starred_responses) AS starredResponses,
        (SELECT COUNT(*) FROM user_profiles) AS profiles,
        (SELECT COUNT(*) FROM user_usage) AS trackedUsage,
        (SELECT COUNT(*) FROM user_subscriptions) AS subscriptions`,
    )
    .get() as AdminActivityInput["exactCounts"];
  const sessions = database
    .prepare(
      `SELECT id, user_id, title, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminSessionActivity[];
  const messages = database
    .prepare(
      `SELECT m.id, COALESCE(s.user_id, '') AS user_id, m.role, m.created_at
       FROM chat_messages m
       LEFT JOIN chat_sessions s ON s.id = m.session_id
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminMessageActivity[];
  const documents = database
    .prepare(
      `SELECT id, user_id, size, created_at
       FROM documents
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminDocumentActivity[];
  const starred = database
    .prepare(
      `SELECT id, user_id, created_at
       FROM starred_responses
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminStarredActivity[];
  const profiles = database
    .prepare(
      `SELECT user_id, display_name, created_at, updated_at
       FROM user_profiles
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminProfileActivity[];
  const usage = database
    .prepare(
      `SELECT user_id, period_started_at, message_count, cooldown_until, updated_at
       FROM user_usage
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as AdminUsageActivity[];
  const subscriptions = database
    .prepare(
      `SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at
       FROM user_subscriptions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as StoredUserSubscription[];
  const feedbackActivity = database
    .prepare(
      `SELECT created_at
       FROM feedback
       WHERE datetime(created_at) >= datetime('now', '-13 day')
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as Array<{ created_at: string }>;
  const accessActivity = database
    .prepare(
      `SELECT created_at, status
       FROM access_requests
       WHERE datetime(created_at) >= datetime('now', '-13 day')
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(adminActivityRowLimit) as Array<{
      created_at: string;
      status?: string | null;
    }>;
  const responseActivity = database
    .prepare("SELECT reaction FROM response_feedback")
    .all() as Array<{ reaction: string }>;

  return buildAdminDashboardSnapshot({
    storageMode: "sqlite",
    registrationSource: "activity",
    baseStats: {
      sessions: Number(baseStatsRow.sessions || 0),
      messages: Number(baseStatsRow.messages || 0),
      feedback: Number(baseStatsRow.feedback || 0),
      averageRating: Number(baseStatsRow.averageRating || 0),
      accessRequests: Number(baseStatsRow.accessRequests || 0),
      responseActions: Number(baseStatsRow.responseActions || 0),
    },
    authUsers: [],
    sessions,
    messages,
    documents,
    starred,
    profiles,
    usage,
    subscriptions,
    feedbackActivity,
    accessActivity,
    responseActivity,
    exactCounts: {
      sessions24h: Number(countRow.sessions24h || 0),
      sessions7d: Number(countRow.sessions7d || 0),
      guestSessions: Number(countRow.guestSessions || 0),
      userMessages: Number(countRow.userMessages || 0),
      assistantMessages: Number(countRow.assistantMessages || 0),
      messages24h: Number(countRow.messages24h || 0),
      messages7d: Number(countRow.messages7d || 0),
      documents: Number(countRow.documents || 0),
      starredResponses: Number(countRow.starredResponses || 0),
      profiles: Number(countRow.profiles || 0),
      trackedUsage: Number(countRow.trackedUsage || 0),
      subscriptions: Number(countRow.subscriptions || 0),
    },
    recentUserLimit,
  });
}

export async function getAdminDashboardData(
  recentUserLimit = 24,
): Promise<AdminDashboardData> {
  if (shouldUseSupabase()) {
    try {
      return await getSupabaseAdminDashboardData(recentUserLimit);
    } catch (error) {
      reportSupabaseError("getAdminDashboardData", error);
    }
  }

  return getSqliteAdminDashboardData(recentUserLimit);
}

export async function getRecentAccessRequests(
  limit = 50,
): Promise<StoredAccessRequest[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("access_requests")
        .select("id, name, email, status, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredAccessRequest[];
    } catch (error) {
      reportSupabaseError("getRecentAccessRequests", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, name, email, status, user_agent, created_at
       FROM access_requests
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredAccessRequest[];
}

export async function getRecentResponseFeedback(
  limit = 100,
): Promise<StoredResponseFeedback[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("response_feedback")
        .select("id, message_id, reaction, comment, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredResponseFeedback[];
    } catch (error) {
      reportSupabaseError("getRecentResponseFeedback", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, message_id, reaction, comment, created_at
       FROM response_feedback
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredResponseFeedback[];
}

export async function getRecentFeedback(
  limit = 50,
): Promise<StoredFeedback[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("feedback")
        .select("id, name, email, rating, suggestion, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredFeedback[];
    } catch (error) {
      reportSupabaseError("getRecentFeedback", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, name, email, rating, suggestion, user_agent, created_at
       FROM feedback
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredFeedback[];
}

export async function getRecentSessions(limit = 50): Promise<StoredSession[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("chat_sessions")
        .select("id, user_id, title, folder, tags, pinned, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredSession[];
    } catch (error) {
      reportSupabaseError("getRecentSessions", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, user_id, title, folder, tags, pinned, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredSession[];
}

export async function getUserSessions(
  userId: string,
  limit = 50,
): Promise<StoredSession[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("chat_sessions")
        .select("id, user_id, title, folder, tags, pinned, created_at, updated_at")
        .eq("user_id", userId)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredSession[];
    } catch (error) {
      reportSupabaseError("getUserSessions", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, user_id, title, folder, tags, pinned, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = ?
       ORDER BY pinned DESC, updated_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as StoredSession[];
}

export async function updateUserSession(input: {
  userId: string;
  sessionId: string;
  title?: string;
  folder?: string;
  tags?: string;
  pinned?: boolean;
}) {
  const updates: Record<string, string | boolean> = {};

  if (input.title !== undefined) {
    updates.title = input.title.slice(0, 80).trim() || "Untitled";
  }

  if (input.folder !== undefined) {
    updates.folder = input.folder.slice(0, 80).trim();
  }

  if (input.tags !== undefined) {
    updates.tags = input.tags.slice(0, 240).trim();
  }

  if (input.pinned !== undefined) {
    updates.pinned = input.pinned;
  }

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("chat_sessions")
        .update(updates)
        .eq("id", input.sessionId)
        .eq("user_id", input.userId);

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("updateUserSession", error);
    }
  }

  const current = getDb()
    .prepare(
      `SELECT title, folder, tags, pinned
       FROM chat_sessions
       WHERE id = ? AND user_id = ?`,
    )
    .get(input.sessionId, input.userId) as
    | { title: string; folder: string; tags: string; pinned: number }
    | undefined;

  if (!current) {
    return;
  }

  getDb()
    .prepare(
      `UPDATE chat_sessions
       SET title = ?, folder = ?, tags = ?, pinned = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      typeof updates.title === "string" ? updates.title : current.title,
      typeof updates.folder === "string" ? updates.folder : current.folder,
      typeof updates.tags === "string" ? updates.tags : current.tags,
      typeof updates.pinned === "boolean"
        ? updates.pinned
          ? 1
          : 0
        : current.pinned,
      input.sessionId,
      input.userId,
    );
}

export async function deleteUserSession(userId: string, sessionId: string) {
  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("chat_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("deleteUserSession", error);
    }
  }

  getDb()
    .prepare("DELETE FROM chat_sessions WHERE id = ? AND user_id = ?")
    .run(sessionId, userId);
}

function getSqliteUserSessionMessages(
  userId: string,
  sessionId: string,
): StoredMessage[] {
  const session = getDb()
    .prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?")
    .get(sessionId, userId);

  if (!session) {
    return [];
  }

  return getDb()
    .prepare(
      `SELECT id, session_id, role, content, created_at
       FROM chat_messages
       WHERE session_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sessionId) as StoredMessage[];
}

export async function getUserSessionMessages(
  userId: string,
  sessionId: string,
): Promise<StoredMessage[]> {
  if (!shouldUseSupabase()) {
    return getSqliteUserSessionMessages(userId, sessionId);
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("chat_messages")
      .select("id, session_id, role, content, created_at, chat_sessions!inner(user_id)")
      .eq("session_id", sessionId)
      .eq("chat_sessions.user_id", userId)
      .order("created_at", { ascending: true });

    throwOnSupabaseError(error);
    return (data || []).map(({ chat_sessions, ...message }) => {
      void chat_sessions;
      return message;
    }) as StoredMessage[];
  } catch (error) {
    reportSupabaseError("getUserSessionMessages", error);
    return getSqliteUserSessionMessages(userId, sessionId);
  }
}

export async function getStarredResponses(
  userId: string,
): Promise<StarredResponse[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("starred_responses")
        .select("id, user_id, message_id, session_id, content, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      throwOnSupabaseError(error);
      return (data || []) as StarredResponse[];
    } catch (error) {
      reportSupabaseError("getStarredResponses", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, user_id, message_id, session_id, content, created_at
       FROM starred_responses
       WHERE user_id = ?
       ORDER BY created_at DESC`,
    )
    .all(userId) as StarredResponse[];
}

export async function setStarredResponse(input: {
  userId: string;
  messageId: string;
  sessionId: string;
  content: string;
  starred: boolean;
}) {
  if (!input.starred) {
    if (shouldUseSupabase()) {
      try {
        const { error } = await createSupabaseAdminClient()
          .from("starred_responses")
          .delete()
          .eq("user_id", input.userId)
          .eq("message_id", input.messageId);

        throwOnSupabaseError(error);
        return;
      } catch (error) {
        reportSupabaseError("setStarredResponse", error);
      }
    }

    getDb()
      .prepare("DELETE FROM starred_responses WHERE user_id = ? AND message_id = ?")
      .run(input.userId, input.messageId);
    return;
  }

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("starred_responses")
        .upsert(
          {
            id: crypto.randomUUID(),
            user_id: input.userId,
            message_id: input.messageId,
            session_id: input.sessionId,
            content: input.content,
          },
          { onConflict: "user_id,message_id" },
        );

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("setStarredResponse", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO starred_responses (id, user_id, message_id, session_id, content)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, message_id) DO UPDATE SET
         session_id = excluded.session_id,
         content = excluded.content,
         created_at = datetime('now')`,
    )
    .run(
      crypto.randomUUID(),
      input.userId,
      input.messageId,
      input.sessionId,
    input.content,
    );
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const cached = await getCacheJson<UserProfile>(userProfileCacheKey(userId));

  if (cached) {
    return cached;
  }

  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("user_profiles")
        .select("user_id, display_name, memory, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      throwOnSupabaseError(error);

      if (data) {
        const profile = data as UserProfile;
        await setCacheJson(userProfileCacheKey(userId), profile, 180);
        return profile;
      }
    } catch (error) {
      reportSupabaseError("getUserProfile", error);
    }
  }

  const existing = getDb()
    .prepare(
      `SELECT user_id, display_name, memory, created_at, updated_at
       FROM user_profiles
       WHERE user_id = ?`,
    )
    .get(userId) as UserProfile | undefined;

  const profile =
    existing || {
      user_id: userId,
      display_name: "",
      memory: "",
      created_at: "",
      updated_at: "",
    };

  await setCacheJson(userProfileCacheKey(userId), profile, 180);
  return profile;
}

export async function saveUserProfile(input: {
  userId: string;
  displayName: string;
  memory: string;
}) {
  const displayName = input.displayName.slice(0, 80).trim();
  const memory = input.memory.slice(0, 4000).trim();
  await deleteCache(userProfileCacheKey(input.userId));

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("user_profiles")
        .upsert(
          {
            user_id: input.userId,
            display_name: displayName,
            memory,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveUserProfile", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO user_profiles (user_id, display_name, memory)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         memory = excluded.memory,
         updated_at = datetime('now')`,
    )
    .run(input.userId, displayName, memory);
  await deleteCache(userProfileCacheKey(input.userId));
}

export async function getRecentMessages(limit = 100): Promise<StoredMessage[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("chat_messages")
        .select("id, session_id, role, content, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredMessage[];
    } catch (error) {
      reportSupabaseError("getRecentMessages", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, session_id, role, content, created_at
       FROM chat_messages
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredMessage[];
}

function readJoinedUserId(value: unknown) {
  if (!value) {
    return "";
  }

  const record = Array.isArray(value) ? value[0] : value;

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }

  const userId = (record as Record<string, unknown>).user_id;
  return typeof userId === "string" ? userId : "";
}

function groupUserPatternRows(
  rows: Array<PromptPatternInput & { user_id: string }>,
  limit: number,
): UserPromptPattern[] {
  const grouped = new Map<string, PromptPatternInput[]>();

  for (const row of rows) {
    const userId = row.user_id.trim();

    if (!userId) {
      continue;
    }

    const prompts = grouped.get(userId) || [];
    prompts.push({ content: row.content, created_at: row.created_at });
    grouped.set(userId, prompts);
  }

  return [...grouped.entries()]
    .map(([userId, prompts]) => ({
      user_id: userId,
      ...analyzePromptPatterns(prompts),
    }))
    .sort((a, b) => (b.lastActive || "").localeCompare(a.lastActive || ""))
    .slice(0, limit);
}

export async function getUserPromptPatternProfile(
  userId: string,
  limit = 80,
): Promise<PromptPatternProfile> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("chat_messages")
        .select("content, created_at, chat_sessions!inner(user_id)")
        .eq("role", "user")
        .eq("chat_sessions.user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);

      return analyzePromptPatterns(
        (data || []).map((row) => ({
          content: typeof row.content === "string" ? row.content : "",
          created_at:
            typeof row.created_at === "string" ? row.created_at : "",
        })),
      );
    } catch (error) {
      reportSupabaseError("getUserPromptPatternProfile", error);
    }
  }

  const rows = getDb()
    .prepare(
      `SELECT m.content, m.created_at
       FROM chat_messages m
       INNER JOIN chat_sessions s ON s.id = m.session_id
       WHERE m.role = 'user'
         AND s.user_id = ?
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as PromptPatternInput[];

  return analyzePromptPatterns(rows);
}

function createUserGfMemo(
  userId: string,
  profile: PromptPatternProfile,
  updatedAt = new Date().toISOString(),
): UserGfMemo {
  return {
    user_id: userId,
    ...profile,
    summary: formatGfMemoMemory(profile).slice(0, 4000),
    updated_at: updatedAt,
  };
}

function readGfMemoJson(value: unknown) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readIntentMix(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label : "";
      const count = Number(record.count || 0);

      return label && Number.isFinite(count)
        ? { label, count: Math.max(0, Math.round(count)) }
        : null;
    })
    .filter((item): item is { label: string; count: number } => item !== null);
}

function normalizeGfMemoRow(
  userId: string,
  row: Record<string, unknown> | null | undefined,
): UserGfMemo | null {
  if (!row) {
    return null;
  }

  const memoJson = readGfMemoJson(row.memo_json);
  const promptCount = Math.max(0, Number(row.prompt_count || memoJson.promptCount || 0));
  const profile: PromptPatternProfile = {
    promptCount,
    averageWords: Math.max(0, Number(memoJson.averageWords || 0)),
    lastActive:
      typeof memoJson.lastActive === "string" ? memoJson.lastActive : "",
    topTopics: readStringArray(memoJson.topTopics),
    intentMix: readIntentMix(memoJson.intentMix),
    styleSignals: readStringArray(memoJson.styleSignals),
    responseProfile:
      typeof memoJson.responseProfile === "string"
        ? memoJson.responseProfile
        : "",
    samplePrompt:
      typeof memoJson.samplePrompt === "string"
        ? memoJson.samplePrompt
        : typeof row.last_prompt_excerpt === "string"
          ? row.last_prompt_excerpt
          : "",
  };
  const summary =
    typeof row.summary === "string" && row.summary
      ? row.summary
      : formatGfMemoMemory(profile).slice(0, 4000);

  return {
    user_id: userId,
    ...profile,
    summary,
    updated_at:
      typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

async function saveUserGfMemo(memo: UserGfMemo) {
  const memoJson = JSON.stringify({
    promptCount: memo.promptCount,
    averageWords: memo.averageWords,
    lastActive: memo.lastActive,
    topTopics: memo.topTopics,
    intentMix: memo.intentMix,
    styleSignals: memo.styleSignals,
    responseProfile: memo.responseProfile,
    samplePrompt: memo.samplePrompt,
  });
  await deleteCache(userGfMemoCacheKey(memo.user_id));

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("gf_memo")
        .upsert(
          {
            user_id: memo.user_id,
            memo_json: memoJson,
            summary: memo.summary,
            prompt_count: memo.promptCount,
            last_prompt_excerpt: memo.samplePrompt.slice(0, 240),
            updated_at: memo.updated_at,
          },
          { onConflict: "user_id" },
        );

      throwOnSupabaseError(error);
      await setCacheJson(userGfMemoCacheKey(memo.user_id), memo, 180);
      return;
    } catch (error) {
      if (!isMissingGfMemoSchema(error)) {
        reportSupabaseError("saveUserGfMemo", error);
      }
    }
  }

  getDb()
    .prepare(
      `INSERT INTO gf_memo (
         user_id,
         memo_json,
         summary,
         prompt_count,
         last_prompt_excerpt,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         memo_json = excluded.memo_json,
         summary = excluded.summary,
         prompt_count = excluded.prompt_count,
         last_prompt_excerpt = excluded.last_prompt_excerpt,
         updated_at = excluded.updated_at`,
    )
    .run(
      memo.user_id,
      memoJson,
      memo.summary,
      memo.promptCount,
      memo.samplePrompt.slice(0, 240),
      memo.updated_at,
    );
  await setCacheJson(userGfMemoCacheKey(memo.user_id), memo, 180);
}

export async function getUserGfMemo(userId: string): Promise<UserGfMemo | null> {
  const cached = await getCacheJson<UserGfMemo>(userGfMemoCacheKey(userId));

  if (cached) {
    return cached;
  }

  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("gf_memo")
        .select(
          "user_id, memo_json, summary, prompt_count, last_prompt_excerpt, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle();

      throwOnSupabaseError(error);
      const memo = normalizeGfMemoRow(userId, data as Record<string, unknown> | null);

      if (memo) {
        await setCacheJson(userGfMemoCacheKey(userId), memo, 180);
      }

      return memo;
    } catch (error) {
      if (!isMissingGfMemoSchema(error)) {
        reportSupabaseError("getUserGfMemo", error);
      }
    }
  }

  const row = getDb()
    .prepare(
      `SELECT user_id, memo_json, summary, prompt_count, last_prompt_excerpt, updated_at
       FROM gf_memo
       WHERE user_id = ?`,
    )
    .get(userId) as Record<string, unknown> | undefined;

  const memo = normalizeGfMemoRow(userId, row);

  if (memo) {
    await setCacheJson(userGfMemoCacheKey(userId), memo, 180);
  }

  return memo;
}

export async function updateUserGfMemo(
  userId: string,
  limit = 100,
): Promise<UserGfMemo> {
  const memo = createUserGfMemo(
    userId,
    await getUserPromptPatternProfile(userId, limit),
  );

  await saveUserGfMemo(memo);
  return memo;
}

export async function getRecentUserPromptPatterns(
  limit = 12,
): Promise<UserPromptPattern[]> {
  const rowLimit = Math.max(limit * 80, 120);

  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("chat_messages")
        .select("content, created_at, chat_sessions!inner(user_id)")
        .eq("role", "user")
        .not("chat_sessions.user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(rowLimit);

      throwOnSupabaseError(error);

      return groupUserPatternRows(
        (data || []).map((row) => ({
          user_id: readJoinedUserId(
            (row as Record<string, unknown>).chat_sessions,
          ),
          content: typeof row.content === "string" ? row.content : "",
          created_at:
            typeof row.created_at === "string" ? row.created_at : "",
        })),
        limit,
      );
    } catch (error) {
      reportSupabaseError("getRecentUserPromptPatterns", error);
    }
  }

  const rows = getDb()
    .prepare(
      `SELECT s.user_id, m.content, m.created_at
       FROM chat_messages m
       INNER JOIN chat_sessions s ON s.id = m.session_id
       WHERE m.role = 'user'
         AND COALESCE(s.user_id, '') <> ''
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(rowLimit) as Array<PromptPatternInput & { user_id: string }>;

  return groupUserPatternRows(rows, limit);
}

export async function getRandomSexualHealthFacts(
  limit = 50,
): Promise<SexualHealthFact[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));

  if (shouldUseSupabase()) {
    try {
      await ensureSupabaseFactsSeeded();

      const { data, error } = await createSupabaseAdminClient()
        .from("sexual_health_facts")
        .select("id, fact")
        .limit(1000);

      throwOnSupabaseError(error);

      return ((data || []) as SexualHealthFact[])
        .sort(() => Math.random() - 0.5)
        .slice(0, safeLimit);
    } catch (error) {
      reportSupabaseError("getRandomSexualHealthFacts", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, fact
       FROM sexual_health_facts
       ORDER BY random()
       LIMIT ?`,
    )
    .all(safeLimit) as SexualHealthFact[];
}

export async function saveDocument(input: {
  id: string;
  userId: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  summary: string;
}) {
  const document = {
    id: input.id,
    user_id: input.userId,
    name: input.name.slice(0, 180).trim() || "Untitled document",
    mime_type: input.mimeType.slice(0, 120),
    size: Math.max(0, input.size),
    content: input.content,
    summary: input.summary,
  };

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("documents")
        .upsert(document, { onConflict: "id" });

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveDocument", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO documents (id, user_id, name, mime_type, size, content, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         mime_type = excluded.mime_type,
         size = excluded.size,
         content = excluded.content,
         summary = excluded.summary`,
    )
    .run(
      document.id,
      document.user_id,
      document.name,
      document.mime_type,
      document.size,
      document.content,
      document.summary,
    );
}

export async function getUserDocuments(
  userId: string,
  limit = 40,
): Promise<StoredDocument[]> {
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("documents")
        .select("id, user_id, name, mime_type, size, content, summary, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      throwOnSupabaseError(error);
      return (data || []) as StoredDocument[];
    } catch (error) {
      reportSupabaseError("getUserDocuments", error);
    }
  }

  return getDb()
    .prepare(
      `SELECT id, user_id, name, mime_type, size, content, summary, created_at
       FROM documents
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(userId, limit) as StoredDocument[];
}

export async function deleteUserDocument(userId: string, documentId: string) {
  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("documents")
        .delete()
        .eq("id", documentId)
        .eq("user_id", userId);

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("deleteUserDocument", error);
    }
  }

  getDb()
    .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
    .run(documentId, userId);
}

export async function renameUserDocument(input: {
  userId: string;
  documentId: string;
  name: string;
}) {
  const name = input.name.slice(0, 180).trim() || "Untitled document";

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("documents")
        .update({ name })
        .eq("id", input.documentId)
        .eq("user_id", input.userId);

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("renameUserDocument", error);
    }
  }

  getDb()
    .prepare("UPDATE documents SET name = ? WHERE id = ? AND user_id = ?")
    .run(name, input.documentId, input.userId);
}

function isActiveSubscriptionStatus(status: string) {
  return status === "active" || status === "trialing";
}

function secondsUntil(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

function defaultUsageRow(userId: string): StoredUserUsage {
  const now = new Date().toISOString();

  return {
    user_id: userId,
    period_started_at: now,
    message_count: 0,
    cooldown_until: null,
    updated_at: now,
  };
}

function normalizeUsageRow(
  userId: string,
  row: Partial<StoredUserUsage> | null | undefined,
): StoredUserUsage {
  const fallback = defaultUsageRow(userId);

  return {
    user_id: userId,
    period_started_at:
      typeof row?.period_started_at === "string"
        ? row.period_started_at
        : fallback.period_started_at,
    message_count: Math.max(0, Number(row?.message_count || 0)),
    cooldown_until:
      typeof row?.cooldown_until === "string" && row.cooldown_until
        ? row.cooldown_until
        : null,
    updated_at:
      typeof row?.updated_at === "string" ? row.updated_at : fallback.updated_at,
  };
}

function defaultSubscriptionRow(userId: string): StoredUserSubscription {
  return {
    user_id: userId,
    stripe_customer_id: "",
    stripe_subscription_id: "",
    stripe_price_id: "",
    status: "none",
    current_period_end: null,
    updated_at: new Date().toISOString(),
  };
}

function normalizeSubscriptionRow(
  userId: string,
  row: Partial<StoredUserSubscription> | null | undefined,
): StoredUserSubscription {
  return {
    ...defaultSubscriptionRow(userId),
    ...row,
    user_id: userId,
    stripe_customer_id:
      typeof row?.stripe_customer_id === "string"
        ? row.stripe_customer_id
        : "",
    stripe_subscription_id:
      typeof row?.stripe_subscription_id === "string"
        ? row.stripe_subscription_id
        : "",
    stripe_price_id:
      typeof row?.stripe_price_id === "string" ? row.stripe_price_id : "",
    status: typeof row?.status === "string" && row.status ? row.status : "none",
    current_period_end:
      typeof row?.current_period_end === "string" && row.current_period_end
        ? row.current_period_end
        : null,
    updated_at:
      typeof row?.updated_at === "string"
        ? row.updated_at
        : new Date().toISOString(),
  };
}

async function getUserUsageRow(userId: string): Promise<StoredUserUsage> {
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from("user_usage")
        .select("user_id, period_started_at, message_count, cooldown_until, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      throwOnSupabaseError(error);

      if (data) {
        return normalizeUsageRow(userId, data as StoredUserUsage);
      }

      const row = defaultUsageRow(userId);
      const { error: insertError } = await supabase
        .from("user_usage")
        .upsert(row, { onConflict: "user_id" });

      throwOnSupabaseError(insertError);
      return row;
    } catch (error) {
      reportSupabaseError("getUserUsageRow", error);
    }
  }

  const database = getDb();
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT OR IGNORE INTO user_usage (user_id, period_started_at, message_count, cooldown_until, updated_at)
       VALUES (?, ?, 0, NULL, ?)`,
    )
    .run(userId, now, now);

  const row = database
    .prepare(
      `SELECT user_id, period_started_at, message_count, cooldown_until, updated_at
       FROM user_usage
       WHERE user_id = ?`,
    )
    .get(userId) as StoredUserUsage | undefined;

  return normalizeUsageRow(userId, row);
}

async function saveUserUsageRow(row: StoredUserUsage) {
  const normalized = normalizeUsageRow(row.user_id, {
    ...row,
    updated_at: new Date().toISOString(),
  });
  await deleteCache(userUsageCacheKey(normalized.user_id));

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("user_usage")
        .upsert(normalized, { onConflict: "user_id" });

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("saveUserUsageRow", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO user_usage (user_id, period_started_at, message_count, cooldown_until, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         period_started_at = excluded.period_started_at,
         message_count = excluded.message_count,
         cooldown_until = excluded.cooldown_until,
         updated_at = excluded.updated_at`,
    )
    .run(
      normalized.user_id,
      normalized.period_started_at,
      normalized.message_count,
      normalized.cooldown_until,
      normalized.updated_at,
    );
}

export async function getUserSubscription(
  userId: string,
): Promise<StoredUserSubscription> {
  const cached = await getCacheJson<StoredUserSubscription>(
    userSubscriptionCacheKey(userId),
  );

  if (cached) {
    return normalizeSubscriptionRow(userId, cached);
  }

  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("user_subscriptions")
        .select(
          "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle();

      throwOnSupabaseError(error);
      const subscription = normalizeSubscriptionRow(
        userId,
        data as StoredUserSubscription,
      );
      await setCacheJson(userSubscriptionCacheKey(userId), subscription, 120);
      return subscription;
    } catch (error) {
      reportSupabaseError("getUserSubscription", error);
    }
  }

  const row = getDb()
    .prepare(
      `SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end, updated_at
       FROM user_subscriptions
       WHERE user_id = ?`,
    )
    .get(userId) as StoredUserSubscription | undefined;

  const subscription = normalizeSubscriptionRow(userId, row);
  await setCacheJson(userSubscriptionCacheKey(userId), subscription, 120);
  return subscription;
}

async function normalizeFreeUsageWindow(userId: string) {
  const row = await getUserUsageRow(userId);
  const cooldownRemaining = secondsUntil(row.cooldown_until);

  if (row.cooldown_until && cooldownRemaining === 0) {
    const resetRow = {
      ...defaultUsageRow(userId),
      period_started_at: new Date().toISOString(),
    };

    await saveUserUsageRow(resetRow);
    return resetRow;
  }

  if (row.message_count >= freeMessageLimit && !row.cooldown_until) {
    const limitedRow = {
      ...row,
      message_count: freeMessageLimit,
      cooldown_until: new Date(Date.now() + freeCooldownMs).toISOString(),
    };

    await saveUserUsageRow(limitedRow);
    return limitedRow;
  }

  return row;
}

export async function getUserUsageStatus(
  userId: string,
): Promise<UserUsageStatus> {
  const cached = await getCacheJson<UserUsageStatus>(userUsageCacheKey(userId));

  if (cached) {
    return {
      ...cached,
      cooldownSecondsRemaining:
        cached.cooldownUntil && cached.plan === "free"
          ? secondsUntil(cached.cooldownUntil)
          : cached.cooldownSecondsRemaining,
      isLimited:
        cached.plan === "free"
          ? Boolean(
              (cached.cooldownUntil && secondsUntil(cached.cooldownUntil) > 0) ||
                ((cached.messagesLimit ?? freeMessageLimit) !== null &&
                  cached.messagesUsed >= (cached.messagesLimit ?? freeMessageLimit)),
            )
          : false,
    };
  }

  const [subscription, usage] = await Promise.all([
    getUserSubscription(userId),
    normalizeFreeUsageWindow(userId),
  ]);
  const hasPaidPlan = isActiveSubscriptionStatus(subscription.status);
  const plan: PlanName = hasPaidPlan
    ? planFromStripePriceId(subscription.stripe_price_id)
    : "free";
  const cooldownSecondsRemaining = hasPaidPlan
    ? 0
    : secondsUntil(usage.cooldown_until);
  const messagesUsed = hasPaidPlan
    ? usage.message_count
    : Math.min(usage.message_count, freeMessageLimit);
  const responsesRemaining = hasPaidPlan
    ? null
    : Math.max(0, freeMessageLimit - messagesUsed);

  const status = {
    plan,
    messagesUsed,
    messagesLimit: hasPaidPlan ? null : freeMessageLimit,
    responsesRemaining,
    cooldownUntil: hasPaidPlan ? null : usage.cooldown_until,
    cooldownSecondsRemaining,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    isLimited: hasPaidPlan
      ? false
      : cooldownSecondsRemaining > 0 || messagesUsed >= freeMessageLimit,
  };

  await setCacheJson(
    userUsageCacheKey(userId),
    status,
    hasPaidPlan ? 120 : Math.min(60, Math.max(5, cooldownSecondsRemaining || 30)),
  );

  return status;
}

export async function getUserMessageAllowance(userId: string) {
  const status = await getUserUsageStatus(userId);

  return {
    allowed: !status.isLimited,
    status,
  };
}

export async function recordUserMessageUse(userId: string) {
  const status = await getUserUsageStatus(userId);

  if (status.plan !== "free" || status.isLimited) {
    return status;
  }

  const row = await getUserUsageRow(userId);
  const nextCount = Math.min(freeMessageLimit, row.message_count + 1);
  const nextRow: StoredUserUsage = {
    ...row,
    message_count: nextCount,
    cooldown_until:
      nextCount >= freeMessageLimit
        ? new Date(Date.now() + freeCooldownMs).toISOString()
        : null,
    updated_at: new Date().toISOString(),
  };

  await saveUserUsageRow(nextRow);
  return getUserUsageStatus(userId);
}

export async function upsertUserSubscription(input: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
}) {
  await deleteCache(userSubscriptionCacheKey(input.userId));
  await deleteCache(userUsageCacheKey(input.userId));
  const row = normalizeSubscriptionRow(input.userId, {
    user_id: input.userId,
    stripe_customer_id: input.stripeCustomerId || "",
    stripe_subscription_id: input.stripeSubscriptionId || "",
    stripe_price_id: input.stripePriceId || "",
    status: input.status || "none",
    current_period_end: input.currentPeriodEnd || null,
    updated_at: new Date().toISOString(),
  });

  if (shouldUseSupabase()) {
    try {
      const { error } = await createSupabaseAdminClient()
        .from("user_subscriptions")
        .upsert(row, { onConflict: "user_id" });

      throwOnSupabaseError(error);
      return;
    } catch (error) {
      reportSupabaseError("upsertUserSubscription", error);
    }
  }

  getDb()
    .prepare(
      `INSERT INTO user_subscriptions (
         user_id,
         stripe_customer_id,
         stripe_subscription_id,
         stripe_price_id,
         status,
         current_period_end,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         stripe_price_id = excluded.stripe_price_id,
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         updated_at = excluded.updated_at`,
    )
    .run(
      row.user_id,
      row.stripe_customer_id,
      row.stripe_subscription_id,
      row.stripe_price_id,
      row.status,
      row.current_period_end,
      row.updated_at,
    );
}

export async function findSubscriptionOwnerByStripeIds(input: {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const customerId = input.stripeCustomerId || "";
  const subscriptionId = input.stripeSubscriptionId || "";

  if (!customerId && !subscriptionId) {
    return null;
  }

  if (shouldUseSupabase()) {
    try {
      let query = createSupabaseAdminClient()
        .from("user_subscriptions")
        .select("user_id")
        .limit(1);

      if (subscriptionId) {
        query = query.eq("stripe_subscription_id", subscriptionId);
      } else {
        query = query.eq("stripe_customer_id", customerId);
      }

      const { data, error } = await query.maybeSingle();
      throwOnSupabaseError(error);

      const userId =
        data && typeof data.user_id === "string" ? data.user_id : "";

      if (userId) {
        return userId;
      }
    } catch (error) {
      reportSupabaseError("findSubscriptionOwnerByStripeIds", error);
    }
  }

  const row = getDb()
    .prepare(
      `SELECT user_id
       FROM user_subscriptions
       WHERE (? != '' AND stripe_subscription_id = ?)
          OR (? != '' AND stripe_customer_id = ?)
       LIMIT 1`,
    )
    .get(subscriptionId, subscriptionId, customerId, customerId) as
    | { user_id: string }
    | undefined;

  return row?.user_id || null;
}
