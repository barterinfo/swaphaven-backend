import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  offersTable,
  offerItemsTable,
  offerRoundsTable,
  offerRoundItemsTable,
} from "../db/schema/index.js";

/** Offer statuses where negotiation is still in progress (deck hide + swipe guard). */
export const ACTIVE_OFFER_STATUSES = ["pending", "countered"] as const;

/** Listing IDs tied to active offers for this user (all items in the latest pending round). */
export async function getActiveNegotiationListingIds(userId: string): Promise<string[]> {
  // Listings from original offer_items the user put into active negotiations as buyer.
  const offeredByUser = await db
    .select({ listingId: offersTable.listingId })
    .from(offersTable)
    .where(
      and(
        eq(offersTable.buyerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
      ),
    );

  // All items (both sides) in pending rounds of active offers the user participates in.
  const roundItemsForUser = await db
    .select({ listingId: offerRoundItemsTable.listingId })
    .from(offerRoundItemsTable)
    .innerJoin(offerRoundsTable, eq(offerRoundItemsTable.offerRoundId, offerRoundsTable.id))
    .innerJoin(offersTable, eq(offerRoundsTable.offerId, offersTable.id))
    .where(
      and(
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
        eq(offerRoundsTable.status, "pending"),
        // Only lock listings belonging to this user.
        inArray(
          offersTable.buyerId,
          // We'll filter by userId participation below via OR; using a subquery
          // workaround: fetch all matching rows then filter in JS.
          [userId],
        ),
      ),
    );

  // Also fetch for seller side.
  const roundItemsAsSeller = await db
    .select({ listingId: offerRoundItemsTable.listingId })
    .from(offerRoundItemsTable)
    .innerJoin(offerRoundsTable, eq(offerRoundItemsTable.offerRoundId, offerRoundsTable.id))
    .innerJoin(offersTable, eq(offerRoundsTable.offerId, offersTable.id))
    .where(
      and(
        eq(offersTable.sellerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
        eq(offerRoundsTable.status, "pending"),
      ),
    );

  // Legacy: offer_items for offers without rounds (pre-migration rows).
  const legacyItems = await db
    .select({ listingId: offerItemsTable.listingId })
    .from(offerItemsTable)
    .innerJoin(offersTable, eq(offerItemsTable.offerId, offersTable.id))
    .where(
      and(
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
        inArray(offersTable.buyerId, [userId]),
      ),
    );

  const ids = new Set([
    ...offeredByUser.map((o) => o.listingId),
    ...roundItemsForUser.map((o) => o.listingId),
    ...roundItemsAsSeller.map((o) => o.listingId),
    ...legacyItems.map((o) => o.listingId),
  ]);
  return [...ids];
}
