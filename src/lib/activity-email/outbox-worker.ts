import { eq } from "drizzle-orm";
import { db, pool } from "../../db/client.js";
import { usersTable } from "../../db/schema/index.js";
import { env } from "../../config/env.js";
import { decryptEmail } from "../email-privacy.js";
import {
  cancelPendingOutboxForUser,
  isPushEnabledForUser,
  isUserOnline,
} from "./gates.js";
import { renderDigestFromRows, renderFromOutboxRow } from "./render-from-payload.js";
import { sendActivityEmail } from "./send.js";

interface OutboxPgRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  summary: string;
}

let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

/**
 * Process due outbox digests. Exported for tests.
 * Claims per-user rows with FOR UPDATE SKIP LOCKED for multi-instance safety.
 */
export async function processActivityEmailOutbox(): Promise<number> {
  if (!env.ACTIVITY_EMAIL_ENABLED) return 0;

  const delayMinutes = env.ACTIVITY_EMAIL_DELAY_MINUTES;
  const dueResult = await pool.query<{ user_id: string }>(
    `SELECT o.user_id
     FROM email_outbox o
     WHERE o.status = 'pending'
     GROUP BY o.user_id
     HAVING MIN(o.created_at) <= now() - ($1 || ' minutes')::interval
     ORDER BY MIN(o.created_at)
     LIMIT 50`,
    [String(delayMinutes)],
  );

  const userIds = dueResult.rows.map((r) => r.user_id);
  if (userIds.length === 0) return 0;

  let sent = 0;
  for (const userId of userIds) {
    try {
      const processed = await processUserOutbox(userId);
      if (processed) sent += 1;
    } catch (err) {
      console.error("[activity-email] outbox tick failed for user", userId, err);
    }
  }
  return sent;
}

async function processUserOutbox(userId: string): Promise<boolean> {
  if (await isPushEnabledForUser(userId) || await isUserOnline(userId)) {
    await cancelPendingOutboxForUser(userId);
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<OutboxPgRow>(
      `SELECT id, event_type, payload, summary
       FROM email_outbox
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED`,
      [userId],
    );
    const rows = locked.rows;
    if (rows.length === 0) {
      await client.query("COMMIT");
      return false;
    }

    const to = await recipientEmail(userId);
    if (!to) {
      await client.query(
        `UPDATE email_outbox SET status = 'cancelled' WHERE id = ANY($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
      await client.query("COMMIT");
      return false;
    }

    const mapped = rows.map((r) => ({
      eventType: r.event_type,
      payload: r.payload,
      summary: r.summary,
    }));

    const rendered =
      mapped.length === 1
        ? renderFromOutboxRow(mapped[0]!)
        : renderDigestFromRows(mapped);

    if (!rendered) {
      await client.query(
        `UPDATE email_outbox SET status = 'cancelled' WHERE id = ANY($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
      await client.query("COMMIT");
      return false;
    }

    await sendActivityEmail(to, rendered);
    await client.query(
      `UPDATE email_outbox
       SET status = 'sent', sent_at = now()
       WHERE id = ANY($1::uuid[])`,
      [rows.map((r) => r.id)],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function recipientEmail(userId: string): Promise<string | null> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { emailCiphertext: true },
  });
  if (!user?.emailCiphertext) return null;
  try {
    return decryptEmail(user.emailCiphertext);
  } catch {
    console.error("[activity-email] Failed to decrypt email for user", userId);
    return null;
  }
}

/** Start the in-process poller. No-op in test. */
export function startActivityEmailOutboxWorker(): void {
  if (env.NODE_ENV === "test") return;
  if (!env.ACTIVITY_EMAIL_ENABLED) {
    console.log("[activity-email] outbox worker disabled (ACTIVITY_EMAIL_ENABLED=false)");
    return;
  }
  if (timer) return;

  console.log(
    `[activity-email] outbox worker started (poll=${env.ACTIVITY_EMAIL_POLL_SECONDS}s delay=${env.ACTIVITY_EMAIL_DELAY_MINUTES}m)`,
  );

  timer = setInterval(() => {
    if (tickInFlight) return;
    tickInFlight = true;
    void processActivityEmailOutbox()
      .catch((err) => console.error("[activity-email] outbox worker error:", err))
      .finally(() => {
        tickInFlight = false;
      });
  }, env.ACTIVITY_EMAIL_POLL_SECONDS * 1000);
  timer.unref?.();
}

export function stopActivityEmailOutboxWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
