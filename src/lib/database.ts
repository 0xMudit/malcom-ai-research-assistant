import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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
  title: string;
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
      title TEXT NOT NULL,
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
  `);

  return db;
}

export function saveChatMessage(input: {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  title?: string;
}) {
  const database = getDb();
  const title = (input.title || input.content).slice(0, 80).trim() || "Untitled";

  database
    .prepare(
      `INSERT INTO chat_sessions (id, title)
       VALUES (?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = datetime('now')`,
    )
    .run(input.sessionId, title);

  database
    .prepare(
      `INSERT OR IGNORE INTO chat_messages (id, session_id, role, content)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.id, input.sessionId, input.role, input.content);
}

export function saveFeedback(input: {
  id: string;
  name: string;
  email: string;
  rating: number;
  suggestion: string;
  userAgent: string;
}) {
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

export function saveAccessRequest(input: {
  id: string;
  name: string;
  email: string;
  userAgent: string;
}) {
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

export function saveResponseFeedback(input: {
  id: string;
  messageId: string;
  reaction: "like" | "dislike" | "comment";
  comment?: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO response_feedback (id, message_id, reaction, comment)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.id, input.messageId, input.reaction, input.comment || "");
}

export function getStats(): AppStats {
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

export function getRecentAccessRequests(limit = 50): StoredAccessRequest[] {
  return getDb()
    .prepare(
      `SELECT id, name, email, status, user_agent, created_at
       FROM access_requests
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredAccessRequest[];
}

export function getRecentResponseFeedback(limit = 100): StoredResponseFeedback[] {
  return getDb()
    .prepare(
      `SELECT id, message_id, reaction, comment, created_at
       FROM response_feedback
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredResponseFeedback[];
}

export function getRecentFeedback(limit = 50): StoredFeedback[] {
  return getDb()
    .prepare(
      `SELECT id, name, email, rating, suggestion, user_agent, created_at
       FROM feedback
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredFeedback[];
}

export function getRecentSessions(limit = 50): StoredSession[] {
  return getDb()
    .prepare(
      `SELECT id, title, created_at, updated_at
       FROM chat_sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredSession[];
}

export function getRecentMessages(limit = 100): StoredMessage[] {
  return getDb()
    .prepare(
      `SELECT id, session_id, role, content, created_at
       FROM chat_messages
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(limit) as StoredMessage[];
}
