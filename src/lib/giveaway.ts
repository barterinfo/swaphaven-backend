import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  offersTable,
  offerRoundsTable,
  offerRoundItemsTable,
  tradesTable,
  conversationsTable,
  notificationsTable,
  listingsTable,
  swipesTable,
} from "../db/schema/index.js";
import { ACTIVE_OFFER_STATUSES } from "./active-offer-listings.js";
import {
  createListingFromPlaceBodySchema,
  pickedPlaceSchema,
  serializeListingBarter,
} from "./barter-listing.js";
import { containsProfanity } from "./moderation.js";
import { isBlockedEitherWay } from "./user-blocks.js";
import { sendPushToUser } from "./push.js";
import {
  buildOfferAcceptedPush,
  buildOfferPush,
  loadRoundSidesForPush,
} from "./push-card-context.js";
import {
  notifyNewSwapOffer,
  notifyOfferAccepted,
  notifyOfferDeclined,
} from "./activity-email/notify.js";
/** Create a free listing from a tapped place (no value / cash / wants). */
export const createGiveawayFromPlaceBodySchema = createListingFromPlaceBodySchema.omit({
  isGiveaway: true,
  acceptCashTopUps: true,
  estimatedValue: true,
  estimatedValueCents: true,
  wantedCategoryIds: true,
  wantedCategories: true,
  wantedFreeText: true,
});

export type CreateGiveawayFromPlaceBody = z.infer<
  typeof createGiveawayFromPlaceBodySchema
>;

/** Patch fields allowed on a free listing (never value / cash / wants). */
export const updateGiveawaySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  condition: z.enum(["new", "like_new", "great", "good", "fair"]).optional(),
  status: z.preprocess(
    (v) => (v === "active" || v === "paused" ? v : undefined),
    z.enum(["active", "paused"]).optional(),
  ),
  place: pickedPlaceSchema.optional(),
});

export type UpdateGiveawayBody = z.infer<typeof updateGiveawaySchema>;

export const createGiveawayInterestSchema = z.object({
  swipeId: z.string().uuid().optional(),
  buyerNote: z.string().max(500).optional(),
});

export type CreateGiveawayInterestBody = z.infer<
  typeof createGiveawayInterestSchema
>;

/**
 * Creates an empty interest offer on a giveaway listing.
 * Returns a result object the route maps to HTTP.
 */
export async function createGiveawayInterest(opts: {
  listingId: string;
  buyerId: string;
  swipeId?: string;
  buyerNote?: string;
}): Promise<
  | { ok: true; status: 201; body: (typeof offersTable.$inferSelect) }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (containsProfanity(opts.buyerNote)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "moderation",
        message: "buyerNote contains inappropriate language and cannot be used.",
      },
    };
  }

  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, opts.listingId),
  });
  if (!listing) {
    return { ok: false, status: 404, body: { error: "not_found", message: "Listing not found" } };
  }
  if (!listing.isGiveaway) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "conflict",
        message: "Use POST /api/offers for barter listings",
      },
    };
  }
  if (listing.userId === opts.buyerId) {
    return {
      ok: false,
      status: 400,
      body: { error: "bad_request", message: "Cannot make an offer on your own listing" },
    };
  }
  if (await isBlockedEitherWay(opts.buyerId, listing.userId)) {
    return {
      ok: false,
      status: 403,
      body: { error: "forbidden", message: "You cannot make an offer to this user" },
    };
  }
  if (listing.status !== "active") {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: "Listing is no longer active" },
    };
  }

  let isSuperlike = false;
  if (opts.swipeId) {
    const swipe = await db.query.swipesTable.findFirst({
      where: eq(swipesTable.id, opts.swipeId),
      columns: { direction: true },
    });
    isSuperlike = swipe?.direction === "super";
  }

  const [offer] = await db
    .insert(offersTable)
    .values({
      listingId: opts.listingId,
      swipeId: opts.swipeId,
      cashTopUpCents: 0,
      buyerNote: opts.buyerNote,
      buyerId: opts.buyerId,
      sellerId: listing.userId,
      isSuperlike,
    })
    .returning();

  const [round] = await db
    .insert(offerRoundsTable)
    .values({
      offerId: offer.id,
      roundNumber: 1,
      proposedBy: "buyer",
      buyerCashTopUpCents: 0,
      sellerCashRequestedCents: 0,
      note: opts.buyerNote ?? null,
    })
    .returning();

  await db.insert(offerRoundItemsTable).values({
    offerRoundId: round.id,
    listingId: opts.listingId,
    side: "seller",
    position: 0,
  });

  await db.insert(notificationsTable).values({
    userId: listing.userId,
    type: "offer_received",
    title: "Someone wants your free item!",
    body: "Someone is interested in your giveaway.",
    relatedOfferId: offer.id,
  });

  void (async () => {
    const payload = await buildOfferPush({
      offerId: offer.id,
      senderUserId: opts.buyerId,
      theirListingIds: [],
      yourListingIds: [opts.listingId],
    });
    await sendPushToUser(listing.userId, payload);
  })().catch(console.error);

  void notifyNewSwapOffer({
    offerId: offer.id,
    senderUserId: opts.buyerId,
    theirListingIds: [],
    yourListingId: opts.listingId,
  }).catch(console.error);

  return { ok: true, status: 201, body: offer };
}

/**
 * Accepts a giveaway interest: trade + chat, listing given_away, other interests denied.
 */
export async function acceptGiveawayInterest(opts: {
  offerId: string;
  userId: string;
}): Promise<
  | {
      ok: true;
      status: 200;
      body: { id: string; conversationId: string } & Record<string, unknown>;
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, opts.offerId),
  });
  if (!offer) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }

  const isBuyer = offer.buyerId === opts.userId;
  const isSeller = offer.sellerId === opts.userId;
  if (!isBuyer && !isSeller) {
    return { ok: false, status: 403, body: { error: "forbidden" } };
  }
  if (isSeller && offer.currentTurn !== "seller") {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: "Not your turn to respond" },
    };
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: "Not your turn to respond" },
    };
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: `Offer is already ${offer.status}` },
    };
  }

  const targetListing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, offer.listingId),
    columns: { id: true, title: true, isGiveaway: true, status: true },
  });
  if (!targetListing?.isGiveaway) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "conflict",
        message: "Use POST /api/offers/:id/accept for barter offers",
      },
    };
  }

  const latestRound = await db.query.offerRoundsTable.findFirst({
    where: and(
      eq(offerRoundsTable.offerId, opts.offerId),
      eq(offerRoundsTable.status, "pending"),
    ),
    orderBy: [desc(offerRoundsTable.roundNumber)],
  });

  await db
    .update(offersTable)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(offersTable.id, offer.id));

  if (latestRound) {
    await db
      .update(offerRoundsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(offerRoundsTable.id, latestRound.id));
  }

  const existingConv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.offerId, offer.id),
  });
  const [trade] = await db
    .insert(tradesTable)
    .values({
      offerId: offer.id,
      acceptedRoundId: latestRound?.id ?? null,
    })
    .returning();
  const conv =
    existingConv ??
    (await db.insert(conversationsTable).values({ offerId: offer.id }).returning())[0]!;

  if (targetListing.status === "active") {
    await db
      .update(listingsTable)
      .set({
        status: "traded",
        soldMethod: "given_away",
        tradedWithUserId: offer.buyerId,
        updatedAt: new Date(),
      })
      .where(eq(listingsTable.id, offer.listingId));

    const otherInterests = await db.query.offersTable.findMany({
      where: and(
        eq(offersTable.listingId, offer.listingId),
        inArray(offersTable.status, [...ACTIVE_OFFER_STATUSES]),
        sql`${offersTable.id} != ${offer.id}`,
      ),
      columns: { id: true, buyerId: true },
    });
    if (otherInterests.length) {
      await db
        .update(offersTable)
        .set({ status: "denied", updatedAt: new Date() })
        .where(inArray(offersTable.id, otherInterests.map((o) => o.id)));
      await db.insert(notificationsTable).values(
        otherInterests.map((o) => ({
          userId: o.buyerId,
          type: "offer_denied" as const,
          title: "Offer declined",
          body: `"${targetListing.title}" has already been given away.`,
          relatedOfferId: o.id,
        })),
      );
      for (const o of otherInterests) {
        void notifyOfferDeclined({
          offerId: o.id,
          notifyUserId: o.buyerId,
          listingTitle: targetListing.title,
          reason: "listing_sold",
        }).catch(console.error);
      }
    }
  }

  const notifyUserId = isSeller ? offer.buyerId : offer.sellerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId,
    type: "offer_accepted",
    title: "You're getting it! 🎉",
    body: "The owner picked you for their free item. Start chatting now.",
    relatedOfferId: offer.id,
    relatedTradeId: trade.id,
    relatedConversationId: conv.id,
  });

  void (async () => {
    const sides = await loadRoundSidesForPush(offer.id);
    const buyerIds = sides?.buyerListingIds ?? [];
    const sellerIds = sides?.sellerListingIds ?? [offer.listingId];
    const yourListingIds = notifyUserId === offer.buyerId ? buyerIds : sellerIds;
    const theirListingIds = notifyUserId === offer.buyerId ? sellerIds : buyerIds;
    const payload = await buildOfferAcceptedPush({
      offerId: offer.id,
      conversationId: conv.id,
      senderUserId: opts.userId,
      yourListingIds,
      theirListingIds,
    });
    await sendPushToUser(notifyUserId, payload);
  })().catch(console.error);

  void notifyOfferAccepted({
    offerId: offer.id,
    conversationId: conv.id,
    accepterUserId: opts.userId,
    notifyUserId,
  }).catch(console.error);

  return {
    ok: true,
    status: 200,
    body: { ...trade, conversationId: conv.id },
  };
}

/** Declines a giveaway interest (same turn rules as barter deny). */
export async function declineGiveawayInterest(opts: {
  offerId: string;
  userId: string;
}): Promise<
  | { ok: true; status: 204 }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, opts.offerId),
  });
  if (!offer) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }

  const targetListing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, offer.listingId),
    columns: { isGiveaway: true, title: true },
  });
  if (!targetListing?.isGiveaway) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "conflict",
        message: "Use POST /api/offers/:id/deny for barter offers",
      },
    };
  }

  const isBuyer = offer.buyerId === opts.userId;
  const isSeller = offer.sellerId === opts.userId;
  if (!isBuyer && !isSeller) {
    return { ok: false, status: 403, body: { error: "forbidden" } };
  }
  if (isSeller && offer.currentTurn !== "seller") {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: "Not your turn to respond" },
    };
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: "Not your turn to respond" },
    };
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return {
      ok: false,
      status: 409,
      body: { error: "conflict", message: `Offer is already ${offer.status}` },
    };
  }

  await db
    .update(offersTable)
    .set({ status: "denied", updatedAt: new Date() })
    .where(eq(offersTable.id, offer.id));

  const latestRound = await db.query.offerRoundsTable.findFirst({
    where: and(
      eq(offerRoundsTable.offerId, opts.offerId),
      eq(offerRoundsTable.status, "pending"),
    ),
    orderBy: [desc(offerRoundsTable.roundNumber)],
  });
  if (latestRound) {
    await db
      .update(offerRoundsTable)
      .set({ status: "denied", updatedAt: new Date() })
      .where(eq(offerRoundsTable.id, latestRound.id));
  }

  const notifyUserId = isSeller ? offer.buyerId : offer.sellerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId,
    type: "offer_denied",
    title: "Offer declined",
    body: "The interest was declined.",
    relatedOfferId: offer.id,
  });
  void notifyOfferDeclined({
    offerId: offer.id,
    notifyUserId,
    listingTitle: targetListing.title?.trim() || "your item",
    reason: "manual",
  }).catch(console.error);

  return { ok: true, status: 204 };
}

export async function serializeGiveawayListing(listingId: string) {
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
    with: { images: true },
  });
  if (!listing) return null;
  const images = (listing.images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => i.url);
  return serializeListingBarter(listing, { images });
}
