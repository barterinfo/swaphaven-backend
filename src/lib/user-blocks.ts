import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { userBlocksTable } from "../db/schema/index.js";

/** Users this caller has blocked (one-way hide only). */
export async function blockedUserIds(blockerId: string): Promise<string[]> {
  const rows = await db
    .select({ blockedId: userBlocksTable.blockedId })
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, blockerId));
  return rows.map((r) => r.blockedId);
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
