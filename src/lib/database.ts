import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  buildSexualHealthFacts,
  targetSexualHealthFactCount,
} from "@/lib/sexual-health-facts";
import { planFromStripePriceId } from "@/lib/stripe";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  createSupabaseAdminClient,
  hasSupabaseAdminConfig,
} from "@/lib/supabase/server";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "malcom.sqlite");

let db: Database.Database | null = null;
let supabaseFactsSeeded = false;

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
    ["folder", "ALTER TABLE chat_sessions ADD COLUMN folder TEXT NOT NULL DEFAULT ''"],
    ["tags", "ALTER TABLE chat_sessions ADD COLUMN tags TEXT NOT NULL DEFAULT ''"],
    ["pinned", "ALTER TABLE chat_sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"],
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

function reportSupabaseError(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Supabase ${action} failed; falling back to SQLite. ${message}`);
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
  if (supabaseFactsSeeded || !shouldUseSupabase()) {
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
  if (shouldUseSupabase()) {
    try {
      const supabase = createSupabaseAdminClient();
      const title =
        (input.title || input.content).slice(0, 80).trim() || "Untitled";
      const updatedAt = new Date().toISOString();

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
      return;
    } catch (error) {
      reportSupabaseError("saveChatMessage", error);
    }
  }

  const database = getDb();
  const title = (input.title || input.content).slice(0, 80).trim() || "Untitled";

  database
    .prepare(
      `INSERT INTO chat_sessions (id, user_id, title)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, chat_sessions.user_id),
         updated_at = datetime('now')`,
    )
    .run(input.sessionId, input.userId || null, title);

  database
    .prepare(
      `INSERT OR IGNORE INTO chat_messages (id, session_id, role, content)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.id, input.sessionId, input.role, input.content);
}

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
  if (shouldUseSupabase()) {
    try {
      const { data, error } = await createSupabaseAdminClient()
        .from("user_profiles")
        .select("user_id, display_name, memory, created_at, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      throwOnSupabaseError(error);

      if (data) {
        return data as UserProfile;
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

  return (
    existing || {
      user_id: userId,
      display_name: "",
      memory: "",
      created_at: "",
      updated_at: "",
    }
  );
}

export async function saveUserProfile(input: {
  userId: string;
  displayName: string;
  memory: string;
}) {
  const displayName = input.displayName.slice(0, 80).trim();
  const memory = input.memory.slice(0, 4000).trim();

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
      return normalizeSubscriptionRow(userId, data as StoredUserSubscription);
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

  return normalizeSubscriptionRow(userId, row);
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

  return {
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
