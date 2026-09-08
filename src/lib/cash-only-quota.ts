import { and, count, eq, gt, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { listingsTable, offerItemsTable, offersTable } from "../db/schema/index.js";

export type CashOnlyQuota = {
  used: number;
  max: number;
  remaining: number;
  activeListingCount: number;
  freeOffers: number;
  bonusOffers: number;
};

/**
 * Lifetime cash-only creates for a buyer: offers with cash > 0 and no
 * offer_items rows (item/hybrid offers do not count; counters do not count).
 */
export async function countCashOnlyCreates(buyerId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(offersTable)
    .leftJoin(offerItemsTable, eq(offerItemsTable.offerId, offersTable.id))
    .where(
      and(
        eq(offersTable.buyerId, buyerId),
        gt(offersTable.cashTopUpCents, 0),
        isNull(offerItemsTable.id),
      ),
    );
  return Number(row?.value ?? 0);
}

export async function countActiveListings(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(listingsTable)
    .where(
      and(eq(listingsTable.userId, userId), eq(listingsTable.status, "active")),
    );
  return Number(row?.value ?? 0);
}

/** max = free + activeListings + bonus; remaining = max(0, max - used). */
export async function getCashOnlyQuota(userId: string): Promise<CashOnlyQuota> {
  const freeOffers = env.CASH_ONLY_FREE_OFFERS;
  const bonusOffers = env.CASH_ONLY_BONUS_OFFERS;
  const [used, activeListingCount] = await Promise.all([
    countCashOnlyCreates(userId),
    countActiveListings(userId),
  ]);
  const max = freeOffers + activeListingCount + bonusOffers;
  const remaining = Math.max(0, max - used);
  return { used, max, remaining, activeListingCount, freeOffers, bonusOffers };
}

/** Pure helper for unit tests. */
export function computeCashOnlyMax(
  freeOffers: number,
  activeListingCount: number,
  bonusOffers: number,
): number {
  return freeOffers + activeListingCount + bonusOffers;
}
