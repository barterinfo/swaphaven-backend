import { and, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { userFollowsTable } from "../db/schema/index.js";

/** User IDs the viewer follows (for deck/search ranking boosts). */
export async function followedOwnerIds(followerId: string): Promise<string[]> {
  const rows = await db
    .select({ followeeId: userFollowsTable.followeeId })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followerId, followerId));
  return rows.map((r) => r.followeeId);
}

/** Follower IDs watching this seller (for new-listing fan-out). */
export async function followerIds(followeeId: string): Promise<string[]> {
  const rows = await db
    .select({ followerId: userFollowsTable.followerId })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followeeId, followeeId));
  return rows.map((r) => r.followerId);
}

/** Drop both directions so a block stops alerts and ranking boosts. */
export async function deleteFollowEdgesBetween(a: string, b: string): Promise<void> {
  if (a === b) return;
  await db
    .delete(userFollowsTable)
    .where(
      or(
        and(eq(userFollowsTable.followerId, a), eq(userFollowsTable.followeeId, b)),
        and(eq(userFollowsTable.followerId, b), eq(userFollowsTable.followeeId, a)),
      ),
    );
}
