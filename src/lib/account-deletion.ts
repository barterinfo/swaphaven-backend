import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  listingsTable,
  notificationsTable,
  offersTable,
  pendingRegistrationsTable,
  tradeReviewsTable,
  tradesTable,
  usersTable,
} from "../db/schema/index.js";
import { OPEN_TRADE_STATUSES } from "./active-offer-listings.js";

const OPEN_OFFER_STATUSES = ["pending", "countered"] as const;

const ACCOUNT_LEFT_OFFER_BODY = "The other user left Barter. This offer was cancelled.";
const ACCOUNT_LEFT_TRADE_BODY = "Trade cancelled — the other user left Barter.";

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export interface PurgeUserAccountResult {
  userId: string;
  email: string;
  offersDeleted: number;
  listingsDeleted: number;
}

type DbClient = Pick<typeof db, "query" | "update" | "insert" | "delete">;

/** Deny pending offers on a listing and notify buyers (account-deletion only). */
async function denyPendingOffersOnListing(
  client: DbClient,
  listingId: string,
  listingTitle: string,
): Promise<void> {
  const pending = await client.query.offersTable.findMany({
    where: and(eq(offersTable.listingId, listingId), eq(offersTable.status, "pending")),
    columns: { id: true, buyerId: true },
  });
  if (!pending.length) return;

  await client
    .update(offersTable)
    .set({ status: "denied", updatedAt: new Date() })
    .where(inArray(offersTable.id, pending.map((o) => o.id)));

  await client.insert(notificationsTable).values(
    pending.map((o) => ({
      userId:         o.buyerId,
      type:           "offer_denied" as const,
      title:          "Offer declined",
      body:           `"${listingTitle}" has been removed. Your offer has been declined.`,
      relatedOfferId: o.id,
    })),
  );
}

/**
 * Hard-delete a user and purge their graph (offers, trades, chats, reviews).
 * Self-contained — does not call listing or offer route helpers.
 */
export async function purgeUserAccount(userId: string): Promise<PurgeUserAccountResult> {
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
  });
  if (!user) throw new AccountDeletionError(`User not found: ${userId}`);

  return db.transaction(async (tx) => {
    const now = new Date();

    const userListings = await tx.query.listingsTable.findMany({
      where: eq(listingsTable.userId, userId),
      columns: { id: true, title: true, status: true },
    });

    await tx
      .update(listingsTable)
      .set({ status: "deleted", updatedAt: now })
      .where(and(eq(listingsTable.userId, userId), ne(listingsTable.status, "deleted")));

    for (const listing of userListings) {
      if (listing.status !== "deleted") {
        await denyPendingOffersOnListing(tx, listing.id, listing.title);
      }
    }

    const involvedOffers = await tx.query.offersTable.findMany({
      where: or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
      columns: { id: true, buyerId: true, sellerId: true, status: true },
    });

    const openOffers = involvedOffers.filter((o) =>
      (OPEN_OFFER_STATUSES as readonly string[]).includes(o.status),
    );
    if (openOffers.length) {
      await tx
        .update(offersTable)
        .set({ status: "denied", updatedAt: now })
        .where(inArray(offersTable.id, openOffers.map((o) => o.id)));

      await tx.insert(notificationsTable).values(
        openOffers.map((o) => ({
          userId:         o.buyerId === userId ? o.sellerId : o.buyerId,
          type:           "offer_denied" as const,
          title:          "Offer declined",
          body:           ACCOUNT_LEFT_OFFER_BODY,
          relatedOfferId: o.id,
        })),
      );
    }

    const offerIds = involvedOffers.map((o) => o.id);
    if (offerIds.length) {
      const openTrades = await tx.query.tradesTable.findMany({
        where: and(
          inArray(tradesTable.offerId, offerIds),
          inArray(tradesTable.status, [...OPEN_TRADE_STATUSES]),
        ),
        columns: { id: true, offerId: true },
      });

      if (openTrades.length) {
        const offerById = new Map(involvedOffers.map((o) => [o.id, o]));
        await tx.insert(notificationsTable).values(
          openTrades.map((t) => {
            const offer = offerById.get(t.offerId)!;
            return {
              userId:         offer.buyerId === userId ? offer.sellerId : offer.buyerId,
              type:           "trade_cancelled" as const,
              title:          "Trade cancelled",
              body:           ACCOUNT_LEFT_TRADE_BODY,
              relatedOfferId: offer.id,
              relatedTradeId: t.id,
            };
          }),
        );
      }
    }

    await tx
      .delete(tradeReviewsTable)
      .where(or(eq(tradeReviewsTable.reviewerId, userId), eq(tradeReviewsTable.revieweeId, userId)));

    if (offerIds.length) {
      await tx.delete(tradesTable).where(inArray(tradesTable.offerId, offerIds));
      await tx.delete(offersTable).where(inArray(offersTable.id, offerIds));
    }

    await tx
      .update(listingsTable)
      .set({ tradedWithUserId: null, updatedAt: now })
      .where(eq(listingsTable.tradedWithUserId, userId));

    await tx
      .delete(pendingRegistrationsTable)
      .where(eq(pendingRegistrationsTable.email, user.email));

    await tx.delete(usersTable).where(eq(usersTable.id, userId));

    return {
      userId: user.id,
      email: user.email,
      offersDeleted: offerIds.length,
      listingsDeleted: userListings.length,
    };
  });
}
