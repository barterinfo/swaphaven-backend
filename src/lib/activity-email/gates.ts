import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  deviceTokensTable,
  emailOutboxTable,
  userPresenceTable,
} from "../../db/schema/index.js";
import { env } from "../../config/env.js";

/** True when the user should receive push (so activity email must not fire). */
export async function isPushEnabledForUser(userId: string): Promise<boolean> {
  const presence = await db.query.userPresenceTable.findFirst({
    where: eq(userPresenceTable.userId, userId),
    columns: { pushEnabled: true },
  });

  if (presence?.pushEnabled === true) return true;
  if (presence?.pushEnabled === false) return false;

  // Legacy clients that never reported: device token row ⇒ treat as push on.
  const [token] = await db
    .select({ id: deviceTokensTable.id })
    .from(deviceTokensTable)
    .where(eq(deviceTokensTable.userId, userId))
    .limit(1);
  return Boolean(token);
}

/**
 * True when the user is considered in-app.
 * Online while `is_foreground` is set (resume heartbeat), until a background
 * heartbeat clears it. `last_seen` TTL is only a force-kill safety net (no
 * periodic heartbeats while foregrounded).
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  const presence = await db.query.userPresenceTable.findFirst({
    where: eq(userPresenceTable.userId, userId),
    columns: { isForeground: true, lastSeenAt: true },
  });
  if (!presence?.isForeground) return false;
  const ttlMs = env.ACTIVITY_EMAIL_ONLINE_TTL_SECONDS * 1000;
  return Date.now() - presence.lastSeenAt.getTime() <= ttlMs;
}

/** Cancel all pending activity-email outbox rows for a user (they came online). */
export async function cancelPendingOutboxForUser(userId: string): Promise<number> {
  const result = await db
    .update(emailOutboxTable)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(emailOutboxTable.userId, userId),
        eq(emailOutboxTable.status, "pending"),
      ),
    )
    .returning({ id: emailOutboxTable.id });
  return result.length;
}

export async function shouldEnqueueActivityEmail(userId: string): Promise<boolean> {
  if (!env.ACTIVITY_EMAIL_ENABLED) return false;
  if (await isPushEnabledForUser(userId)) return false;
  if (await isUserOnline(userId)) return false;
  return true;
}

/** Upsert presence; throttle identical writes under ~30s. Returns whether a write happened. */
export async function upsertPresence(args: {
  userId: string;
  isForeground: boolean;
  pushEnabled: boolean;
}): Promise<{ wrote: boolean }> {
  const now = new Date();
  const existing = await db.query.userPresenceTable.findFirst({
    where: eq(userPresenceTable.userId, args.userId),
  });

  if (existing) {
    const ageMs = now.getTime() - existing.updatedAt.getTime();
    const sameState =
      existing.isForeground === args.isForeground &&
      existing.pushEnabled === args.pushEnabled;
    if (sameState && ageMs < 30_000) {
      return { wrote: false };
    }
  }

  await db
    .insert(userPresenceTable)
    .values({
      userId: args.userId,
      lastSeenAt: now,
      isForeground: args.isForeground,
      pushEnabled: args.pushEnabled,
      pushReportedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userPresenceTable.userId,
      set: {
        lastSeenAt: now,
        isForeground: args.isForeground,
        pushEnabled: args.pushEnabled,
        pushReportedAt: now,
        updatedAt: now,
      },
    });

  return { wrote: true };
}
