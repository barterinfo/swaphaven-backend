import { and, count, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  messagesTable,
  offersTable,
  tradesTable,
  userProfilesTable,
} from "../db/schema/index.js";

/** Terminal trade statuses that count toward Success %. */
const TERMINAL_STATUSES = ["completed", "cancelled", "disputed"] as const;

/** Ignore reply gaps longer than 7 days (stale threads). */
const MAX_RESPONSE_GAP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Recompute Success % for a user:
 * completed / (completed + cancelled + disputed) × 100.
 * Writes both `completionRate` (public) and `tradeScore` (/me) so they stay in sync.
 * Returns null when the user has no terminal trades yet.
 */
export async function refreshCompletionRate(userId: string): Promise<number | null> {
  const rows = await db
    .select({
      status: tradesTable.status,
      n: count(),
    })
    .from(tradesTable)
    .innerJoin(offersTable, eq(tradesTable.offerId, offersTable.id))
    .where(
      and(
        or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
        inArray(tradesTable.status, [...TERMINAL_STATUSES]),
      ),
    )
    .groupBy(tradesTable.status);

  let completed = 0;
  let terminal = 0;
  for (const row of rows) {
    const n = Number(row.n);
    terminal += n;
    if (row.status === "completed") completed += n;
  }

  const rate = terminal === 0 ? null : Math.round((completed / terminal) * 100);

  await db
    .update(userProfilesTable)
    .set({
      completionRate: rate,
      // Keep /me tradeScore aligned when we have a real rate; leave unchanged if none yet.
      ...(rate != null ? { tradeScore: rate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.id, userId));

  return rate;
}

/** Refresh Success % for both parties on a trade. */
export async function refreshCompletionRateForUsers(
  userIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map((id) => refreshCompletionRate(id)));
}

/**
 * When `senderId` replies to the other party's latest message in this
 * conversation, fold the gap (minutes) into `avgResponseMinutes` via EMA.
 * No-op for consecutive own messages, system messages, or gaps over 7 days.
 */
export async function recordMessageResponse(
  conversationId: string,
  senderId: string,
  messageCreatedAt: Date,
): Promise<void> {
  const [prior] = await db
    .select({
      senderId: messagesTable.senderId,
      createdAt: messagesTable.createdAt,
      type: messagesTable.type,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        lt(messagesTable.createdAt, messageCreatedAt),
        ne(messagesTable.type, "system"),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  if (!prior || prior.senderId === senderId) return;

  const gapMs = messageCreatedAt.getTime() - prior.createdAt.getTime();
  if (gapMs <= 0 || gapMs > MAX_RESPONSE_GAP_MS) return;

  const deltaMinutes = Math.max(1, Math.round(gapMs / 60_000));

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, senderId),
    columns: { avgResponseMinutes: true },
  });
  if (!profile) return;

  const next =
    profile.avgResponseMinutes == null
      ? deltaMinutes
      : Math.round(profile.avgResponseMinutes * 0.7 + deltaMinutes * 0.3);

  await db
    .update(userProfilesTable)
    .set({ avgResponseMinutes: next, updatedAt: new Date() })
    .where(eq(userProfilesTable.id, senderId));
}
