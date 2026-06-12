import {
  getRecentAccessRequests,
  getRecentFeedback,
  getRecentMessages,
  getRecentResponseFeedback,
  getRecentSessions,
  getStats,
  updateAccessRequestStatus,
} from "@/lib/database";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Malcom Admin Dashboard",
  description: "Review access requests, feedback, chats, and response actions.",
};

async function setAccessStatus(formData: FormData) {
  "use server";

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

export default async function AdminPage() {
  const [
    stats,
    feedback,
    accessRequests,
    responseActions,
    sessions,
    messages,
  ] = await Promise.all([
    getStats(),
    getRecentFeedback(),
    getRecentAccessRequests(),
    getRecentResponseFeedback(),
    getRecentSessions(),
    getRecentMessages(),
  ]);

  return (
    <main className={styles.admin}>
      <header className={styles.header}>
        <div>
          <p>Malcom Admin</p>
          <h1>Workspace dashboard</h1>
        </div>
        <span>Protected console</span>
      </header>

      <section className={styles.stats} aria-label="Overview">
        <div>
          <span>Sessions</span>
          <strong>{stats.sessions}</strong>
        </div>
        <div>
          <span>Messages</span>
          <strong>{stats.messages}</strong>
        </div>
        <div>
          <span>Feedback</span>
          <strong>{stats.feedback}</strong>
        </div>
        <div>
          <span>Access requests</span>
          <strong>{stats.accessRequests}</strong>
        </div>
        <div>
          <span>Response actions</span>
          <strong>{stats.responseActions}</strong>
        </div>
        <div>
          <span>Avg rating</span>
          <strong>{stats.averageRating.toFixed(1)}</strong>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>Access requests</h2>
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
                        <span className={styles.status}>{request.status}</span>
                      </td>
                      <td>{request.created_at}</td>
                      <td>
                        <form className={styles.actions} action={setAccessStatus}>
                          <input type="hidden" name="id" value={request.id} />
                          <button
                            type="submit"
                            name="status"
                            value="approved"
                            disabled={request.status === "approved"}
                          >
                            Approve
                          </button>
                          <button
                            type="submit"
                            name="status"
                            value="rejected"
                            disabled={request.status === "rejected"}
                          >
                            Reject
                          </button>
                          <button
                            type="submit"
                            name="status"
                            value="pending"
                            disabled={request.status === "pending"}
                          >
                            Reset
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No access requests yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Response actions</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Reaction</th>
                  <th>Message</th>
                  <th>Comment</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {responseActions.length ? (
                  responseActions.map((action) => (
                    <tr key={action.id}>
                      <td>{action.reaction}</td>
                      <td>{action.message_id}</td>
                      <td>{action.comment || "-"}</td>
                      <td>{action.created_at}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No response actions yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>Feedback</h2>
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
                      <td>{item.created_at}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>No feedback yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>Recent chats</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length ? (
                  sessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.title}</td>
                      <td>{session.updated_at}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2}>No chats yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Saved responses</h2>
          <div className={styles.messageList}>
            {messages.length ? (
              messages.map((message) => (
                <article key={message.id}>
                  <div>
                    <span>{message.role}</span>
                    <time>{message.created_at}</time>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))
            ) : (
              <p>No saved messages yet.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
