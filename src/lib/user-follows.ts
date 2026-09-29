import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { userFollowsTable, userProfilesTable } from "../db/schema/index.js";

/** Cap followee IDs loaded for deck / search injection (most recently followed). */
export const DISCOVERY_FOLLOWEE_CAP = 200;

/** User IDs the viewer follows (for deck/search ranking boosts). Newest first, capped. */
export async function followedOwnerIds(
  followerId: string,
  opts?: { limit?: number },
): Promise<string[]> {
  const limit = opts?.limit ?? DISCOVERY_FOLLOWEE_CAP;
  const rows = await db
    .select({ followeeId: userFollowsTable.followeeId })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followerId, followerId))
    .orderBy(desc(userFollowsTable.createdAt))
    .limit(limit);
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

/** Keep denormalized profile counts in sync with follow edges. */
export async function adjustFollowCounts(opts: {
  followerId: string;
  followeeId: string;
  delta: 1 | -1;
}): Promise<void> {
  const { followerId, followeeId, delta } = opts;
  await Promise.all([
    db
      .update(userProfilesTable)
      .set({
        followingCount: sql`GREATEST(0, ${userProfilesTable.followingCount} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.id, followerId)),
    db
      .update(userProfilesTable)
      .set({
        followerCount: sql`GREATEST(0, ${userProfilesTable.followerCount} + ${delta})`,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.id, followeeId)),
  ]);
}

/** Drop both directions so a block stops alerts and ranking boosts. */
export async function deleteFollowEdgesBetween(a: string, b: string): Promise<void> {
  if (a === b) return;
  const existing = await db
    .select({
      followerId: userFollowsTable.followerId,
      followeeId: userFollowsTable.followeeId,
    })
    .from(userFollowsTable)
    .where(
      or(
        and(eq(userFollowsTable.followerId, a), eq(userFollowsTable.followeeId, b)),
        and(eq(userFollowsTable.followerId, b), eq(userFollowsTable.followeeId, a)),
      ),
    );
  if (!existing.length) return;

  await db
    .delete(userFollowsTable)
    .where(
      or(
        and(eq(userFollowsTable.followerId, a), eq(userFollowsTable.followeeId, b)),
        and(eq(userFollowsTable.followerId, b), eq(userFollowsTable.followeeId, a)),
      ),
    );

  await Promise.all(
    existing.map((edge) =>
      adjustFollowCounts({
        followerId: edge.followerId,
        followeeId: edge.followeeId,
        delta: -1,
      }),
    ),
  );
}
