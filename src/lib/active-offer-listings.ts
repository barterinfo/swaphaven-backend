import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  offersTable,
  offerItemsTable,
  offerRoundsTable,
  offerRoundItemsTable,
  tradesTable,
} from "../db/schema/index.js";

/** Offer statuses where negotiation is still in progress (deck hide + swipe guard). */
export const ACTIVE_OFFER_STATUSES = ["pending", "countered"] as const;

/** Trade statuses that still lock discovery of involved listings. */
export const OPEN_TRADE_STATUSES = ["pending_meetup", "disputed"] as const;

/**
 * Listing IDs the user should not see in discovery (swipe / search / nearby):
 * - Target listing of any pending/countered offer they are buyer or seller on
 * - Items in pending rounds of those offers
 * - Target listing of any open trade (pending meetup / disputed) they are in
 */
export async function getActiveNegotiationListingIds(userId: string): Promise<string[]> {
  // Target listing when user is the buyer on an active offer.
  const asBuyer = await db
    .select({ listingId: offersTable.listingId })
    .from(offersTable)
    .where(
      and(
        eq(offersTable.buyerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
      ),
    );

  // Target listing when user is the seller on an active offer.
  const asSeller = await db
    .select({ listingId: offersTable.listingId })
    .from(offersTable)
    .where(
      and(
        eq(offersTable.sellerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
      ),
    );

  // All items (both sides) in pending rounds of active offers the user is in.
  const roundItemsAsBuyer = await db
    .select({ listingId: offerRoundItemsTable.listingId })
    .from(offerRoundItemsTable)
    .innerJoin(offerRoundsTable, eq(offerRoundItemsTable.offerRoundId, offerRoundsTable.id))
    .innerJoin(offersTable, eq(offerRoundsTable.offerId, offersTable.id))
    .where(
      and(
        eq(offersTable.buyerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
        eq(offerRoundsTable.status, "pending"),
      ),
    );

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
        or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
      ),
    );

  // Open trades (accepted offers still being fulfilled).
  const openTradeListings = await db
    .select({ listingId: offersTable.listingId })
    .from(tradesTable)
    .innerJoin(offersTable, eq(tradesTable.offerId, offersTable.id))
    .where(
      and(
        inArray(tradesTable.status, [...OPEN_TRADE_STATUSES]),
        or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
      ),
    );

  const ids = new Set([
    ...asBuyer.map((o) => o.listingId),
    ...asSeller.map((o) => o.listingId),
    ...roundItemsAsBuyer.map((o) => o.listingId),
    ...roundItemsAsSeller.map((o) => o.listingId),
    ...legacyItems.map((o) => o.listingId),
    ...openTradeListings.map((o) => o.listingId),
  ]);
  return [...ids];
}
