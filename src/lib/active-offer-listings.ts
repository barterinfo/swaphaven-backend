import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  offersTable,
  offerItemsTable,
  counterOffersTable,
  counterOfferItemsTable,
} from "../db/schema/index.js";

/** Offer statuses where negotiation is still in progress (deck hide + swipe guard). */
export const ACTIVE_OFFER_STATUSES = ["pending", "countered"] as const;

/** Listing IDs tied to active offers for this user (buyer target + seller's included offer items). */
export async function getActiveNegotiationListingIds(userId: string): Promise<string[]> {
  const offeredByUser = await db
    .select({ listingId: offersTable.listingId })
    .from(offersTable)
    .where(
      and(
        eq(offersTable.buyerId, userId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
      ),
    );

  const offeredToUserPending = await db
    .select({ listingId: offerItemsTable.listingId })
    .from(offerItemsTable)
    .innerJoin(offersTable, eq(offerItemsTable.offerId, offersTable.id))
    .where(
      and(
        eq(offersTable.sellerId, userId),
        eq(offersTable.status, "pending"),
      ),
    );

  const offeredToUserCountered = await db
    .select({ listingId: offerItemsTable.listingId })
    .from(offerItemsTable)
    .innerJoin(offersTable, eq(offerItemsTable.offerId, offersTable.id))
    .innerJoin(counterOffersTable, eq(counterOffersTable.offerId, offersTable.id))
    .innerJoin(
      counterOfferItemsTable,
      and(
        eq(counterOfferItemsTable.counterOfferId, counterOffersTable.id),
        eq(counterOfferItemsTable.offerItemId, offerItemsTable.id),
      ),
    )
    .where(
      and(
        eq(offersTable.sellerId, userId),
        eq(offersTable.status, "countered"),
        eq(counterOfferItemsTable.isIncluded, true),
      ),
    );

  return [
    ...offeredByUser.map((o) => o.listingId),
    ...offeredToUserPending.map((o) => o.listingId),
    ...offeredToUserCountered.map((o) => o.listingId),
  ];
}
