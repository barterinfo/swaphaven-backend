import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { userBlocksTable } from "../db/schema/index.js";

/** Users this caller has blocked (inbox hide: people I blocked). */
export async function blockedUserIds(blockerId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: userBlocksTable.blockedId })
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, blockerId));
  return rows.map((r) => r.blockedId);
}

/**
 * Listing owners this viewer must not see: people they blocked, and people
 * who blocked them. Offers/chat already reject both directions; discovery
 * has to match or a right-swipe leads to a 403 on POST /api/offers.
 */
export async function hiddenOwnerIds(viewerId: string): Promise<string[]> {
  const rows = await db
    .select({
      blockerId: userBlocksTable.blockerId,
      blockedId: userBlocksTable.blockedId,
    })
    .from(userBlocksTable)
    .where(
      or(
        eq(userBlocksTable.blockerId, viewerId),
        eq(userBlocksTable.blockedId, viewerId),
      ),
    );
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.blockerId === viewerId) ids.add(row.blockedId);
    else ids.add(row.blockerId);
  }
  return [...ids];
}

/** True when either person has blocked the other (blocks chat/offers both ways). */
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [row] = await db
    .select({ id: userBlocksTable.id })
    .from(userBlocksTable)
    .where(
      or(
        and(eq(userBlocksTable.blockerId, a), eq(userBlocksTable.blockedId, b)),
        and(eq(userBlocksTable.blockerId, b), eq(userBlocksTable.blockedId, a)),
      ),
    )
    .limit(1);
  return Boolean(row);
}
