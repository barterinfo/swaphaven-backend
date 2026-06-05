import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { swipesTable } from "../db/schema/index.js";

/**
 * Returns a map of listingId → right-swipe count for the given listing IDs.
 * Missing entries (no right swipes yet) are absent from the map; callers should default to 0.
 */
export async function fetchRightSwipeCounts(
  listingIds: string[],
): Promise<Map<string, number>> {
  if (!listingIds.length) return new Map();
  const rows = await db
    .select({
      listingId: swipesTable.listingId,
      count: sql<number>`count(*)::int`,
    })
    .from(swipesTable)
    .where(
      and(
        inArray(swipesTable.listingId, listingIds),
        eq(swipesTable.direction, "right"),
      ),
    )
    .groupBy(swipesTable.listingId);
  return new Map(rows.map((r) => [r.listingId, r.count]));
}
