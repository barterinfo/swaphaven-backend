import { Router, type Response } from "express";
import { and, eq, desc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  offersTable, offerItemsTable, counterOffersTable,
  offerRoundsTable, offerRoundItemsTable,
  tradesTable, conversationsTable, notificationsTable, listingsTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p } from "../lib/route-helpers.js";
import { serializeOfferListItem, serializeOfferRound } from "../lib/inbox-serializers.js";
import { ACTIVE_OFFER_STATUSES } from "../lib/active-offer-listings.js";
import { MAX_OFFER_ROUNDS } from "../lib/max-rounds.js";
import { sendPushToUser } from "../lib/push.js";
import {
  buildCounterOfferPush,
  buildOfferAcceptedPush,
  buildOfferPush,
  loadRoundSidesForPush,
} from "../lib/push-card-context.js";

const router = Router();

/** Listing columns shared by offer list / round item payloads. */
const listingSummaryColumns = {
  id: true,
  title: true,
  estimatedValue: true,
  estimatedValueCents: true,
  status: true,
} as const;

/** Relations needed to render an offer row in the mobile inbox. */
const offerListWith = {
  listing: {
    columns: listingSummaryColumns,
    with: {
      images: true,
      user: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
    },
  },
  buyer: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
  seller: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
  items: { with: { listing: { columns: listingSummaryColumns, with: { images: true } } } },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetches and serializes the latest pending round for an offer, or null. */
async function getLatestRound(offerId: string) {
  const round = await db.query.offerRoundsTable.findFirst({
    where: and(eq(offerRoundsTable.offerId, offerId), eq(offerRoundsTable.status, "pending")),
    orderBy: [desc(offerRoundsTable.roundNumber)],
    with: {
      items: {
        with: {
          listing: {
            columns: listingSummaryColumns,
            with: { images: true },
          },
        },
      },
    },
  });
  return round ? serializeOfferRound(round) : null;
}

// ─── POST /api/offers ─────────────────────────────────────────────────────────
const createOfferSchema = z.object({
  listingId:         z.string().uuid(),
  swipeId:           z.string().uuid().optional(),
  offeredListingIds: z.array(z.string().uuid()).min(1, "At least one item must be offered"),
  cashTopUpCents:    z.number().int().min(0).default(0),
  buyerNote:         z.string().max(500).optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { offeredListingIds, ...offerData } = parsed.data;
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, offerData.listingId),
  });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId === req.user!.sub) {
    return res.status(400).json({ error: "bad_request", message: "Cannot make an offer on your own listing" });
  }
  if (listing.status !== "active") {
    return res.status(409).json({ error: "conflict", message: "Listing is no longer active" });
  }

  const [offer] = await db
    .insert(offersTable)
    .values({ ...offerData, buyerId: req.user!.sub, sellerId: listing.userId })
    .returning();

  // Original offer items (buyer side) — kept for legacy compatibility.
  await db.insert(offerItemsTable).values(
    offeredListingIds.map((lid, i) => ({ offerId: offer.id, listingId: lid, position: i })),
  );

  // Round 1 = buyer's original proposal.
  const [round] = await db.insert(offerRoundsTable).values({
    offerId: offer.id,
    roundNumber: 1,
    proposedBy: "buyer",
    buyerCashTopUpCents: offerData.cashTopUpCents ?? 0,
    sellerCashRequestedCents: 0,
    note: offerData.buyerNote ?? null,
  }).returning();

  // Buyer's items on the buyer side.
  await db.insert(offerRoundItemsTable).values(
    offeredListingIds.map((lid, i) => ({
      offerRoundId: round.id,
      listingId: lid,
      side: "buyer" as const,
      position: i,
    })),
  );
  // Seller's listing on the seller side.
  await db.insert(offerRoundItemsTable).values([{
    offerRoundId: round.id,
    listingId: offerData.listingId,
    side: "seller" as const,
    position: 0,
  }]);

  await db.insert(notificationsTable).values({
    userId: listing.userId,
    type: "offer_received",
    title: "New swap offer!",
    body: "Someone wants to trade for your item.",
    relatedOfferId: offer.id,
  });
  // Rich FCM card for the seller (recipient): their = buyer items, your = target listing.
  void (async () => {
    const payload = await buildOfferPush({
      offerId: offer.id,
      senderUserId: req.user!.sub,
      theirListingIds: offeredListingIds,
      yourListingIds: [offerData.listingId],
    });
    await sendPushToUser(listing.userId, payload);
  })().catch(console.error);
  return res.status(201).json(offer);
});

// ─── GET /api/offers/received ─────────────────────────────────────────────────
router.get("/received", requireAuth, async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { status } = req.query as { status?: string };

  const conditions: SQL<unknown>[] = [eq(offersTable.sellerId, req.user!.sub)];
  if (status) conditions.push(eq(offersTable.status, status as "pending"));

  const items = await db.query.offersTable.findMany({
    where: and(...conditions),
    with: offerListWith,
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items: items.map(serializeOfferListItem), nextCursor });
});

// ─── GET /api/offers/sent ─────────────────────────────────────────────────────
router.get("/sent", requireAuth, async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { status } = req.query as { status?: string };

  const conditions: SQL<unknown>[] = [eq(offersTable.buyerId, req.user!.sub)];
  if (status) conditions.push(eq(offersTable.status, status as "pending"));

  const items = await db.query.offersTable.findMany({
    where: and(...conditions),
    with: offerListWith,
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items: items.map(serializeOfferListItem), nextCursor });
});

// ─── GET /api/offers/:offerId ─────────────────────────────────────────────────
router.get("/:offerId", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, offerId),
    with: offerListWith,
  });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub && offer.sellerId !== req.user!.sub) {
    return res.status(403).json({ error: "forbidden" });
  }

  const [latestRound, counterOffer, conversation] = await Promise.all([
    getLatestRound(offerId),
    db.query.counterOffersTable.findFirst({
      where: eq(counterOffersTable.offerId, offer.id),
      with: { items: { with: { offerItem: true } } },
    }),
    db.query.conversationsTable.findFirst({
      where: eq(conversationsTable.offerId, offer.id),
    }),
  ]);

  return res.json({
    ...serializeOfferListItem(offer),
    currentTurn: offer.currentTurn,
    roundCount: offer.roundCount,
    latestRound,
    // Kept for backward compatibility with old mobile builds.
    counterOffer,
    conversationId: conversation?.id ?? null,
  });
});

// ─── Shared accept / deny implementation ──────────────────────────────────────

async function handleAccept(offerId: string, userId: string, res: Response) {
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });

  const isBuyer = offer.buyerId === userId;
  const isSeller = offer.sellerId === userId;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: "forbidden" });

  if (isSeller && offer.currentTurn !== "seller") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to respond" });
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to respond" });
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return res.status(409).json({ error: "conflict", message: `Offer is already ${offer.status}` });
  }

  const latestRound = await db.query.offerRoundsTable.findFirst({
    where: and(eq(offerRoundsTable.offerId, offerId), eq(offerRoundsTable.status, "pending")),
    orderBy: [desc(offerRoundsTable.roundNumber)],
    with: {
      items: {
        with: { listing: { columns: { id: true, status: true } } },
      },
    },
  });

  // Block accept when any item in the pending round is sold or deleted.
  const inactive = (latestRound?.items ?? []).find(
    (item) => item.listing && item.listing.status !== "active",
  );
  if (inactive?.listing) {
    return res.status(409).json({
      error: "conflict",
      message: `Listing ${inactive.listing.id} is no longer active`,
    });
  }

  await db.update(offersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));

  if (latestRound) {
    await db.update(offerRoundsTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offerRoundsTable.id, latestRound.id));
  }

  const existingConv = await db.query.conversationsTable.findFirst({ where: eq(conversationsTable.offerId, offer.id) });
  const [trade] = await db.insert(tradesTable).values({
    offerId: offer.id,
    acceptedRoundId: latestRound?.id ?? null,
  }).returning();
  const conv = existingConv ?? (await db.insert(conversationsTable).values({ offerId: offer.id }).returning())[0]!;

  const notifyUserId = isSeller ? offer.buyerId : offer.sellerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId, type: "offer_accepted",
    title: "Offer accepted! 🎉", body: "Your trade offer was accepted. Start chatting now.",
    relatedOfferId: offer.id, relatedTradeId: trade.id, relatedConversationId: conv.id,
  });
  // Recipient = notifyUserId; their* = accepter's side, your* = recipient's side.
  void (async () => {
    const sides = await loadRoundSidesForPush(offer.id);
    const buyerIds = sides?.buyerListingIds ?? [];
    const sellerIds = sides?.sellerListingIds ?? [offer.listingId];
    const yourListingIds = notifyUserId === offer.buyerId ? buyerIds : sellerIds;
    const theirListingIds = notifyUserId === offer.buyerId ? sellerIds : buyerIds;
    const payload = await buildOfferAcceptedPush({
      offerId: offer.id,
      conversationId: conv.id,
      senderUserId: userId,
      yourListingIds,
      theirListingIds,
    });
    await sendPushToUser(notifyUserId, payload);
  })().catch(console.error);
  return res.json({ ...trade, conversationId: conv.id });
}

async function handleDeny(offerId: string, userId: string, res: Response) {
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });

  const isBuyer = offer.buyerId === userId;
  const isSeller = offer.sellerId === userId;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: "forbidden" });

  if (isSeller && offer.currentTurn !== "seller") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to respond" });
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to respond" });
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return res.status(409).json({ error: "conflict", message: `Offer is already ${offer.status}` });
  }

  await db.update(offersTable).set({ status: "denied", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));

  const latestRound = await db.query.offerRoundsTable.findFirst({
    where: and(eq(offerRoundsTable.offerId, offerId), eq(offerRoundsTable.status, "pending")),
    orderBy: [desc(offerRoundsTable.roundNumber)],
  });
  if (latestRound) {
    await db.update(offerRoundsTable).set({ status: "denied", updatedAt: new Date() }).where(eq(offerRoundsTable.id, latestRound.id));
  }

  const notifyUserId = isSeller ? offer.buyerId : offer.sellerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId, type: "offer_denied",
    title: "Offer declined", body: "The trade offer was declined.",
    relatedOfferId: offer.id,
  });
  return res.status(204).send();
}

// ─── POST /api/offers/:offerId/accept ─────────────────────────────────────────
router.post("/:offerId/accept", requireAuth, (req, res) =>
  handleAccept(p(req.params["offerId"]), req.user!.sub, res),
);

// ─── POST /api/offers/:offerId/deny ───────────────────────────────────────────
router.post("/:offerId/deny", requireAuth, (req, res) =>
  handleDeny(p(req.params["offerId"]), req.user!.sub, res),
);

// ─── POST /api/offers/:offerId/withdraw ───────────────────────────────────────
router.post("/:offerId/withdraw", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return res.status(409).json({ error: "conflict", message: `Cannot withdraw an offer with status ${offer.status}` });
  }

  await db.update(offersTable).set({ status: "withdrawn", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));
  await db.insert(notificationsTable).values({
    userId: offer.sellerId, type: "offer_withdrawn",
    title: "Offer withdrawn", body: "The buyer withdrew their swap offer.",
    relatedOfferId: offer.id,
  });
  return res.status(204).send();
});

// ─── POST /api/offers/:offerId/counter ────────────────────────────────────────
// Bidirectional: either the seller (on a pending or seller-turn countered offer) or the buyer
// (on a buyer-turn countered offer) can submit. Validates listing ownership, active status, and round cap.
const counterSchema = z.object({
  buyerListingIds:          z.array(z.string().uuid()).min(1, "At least one buyer item required"),
  sellerListingIds:         z.array(z.string().uuid()).min(1, "At least one seller item required"),
  buyerCashTopUpCents:      z.number().int().min(0).default(0),
  sellerCashRequestedCents: z.number().int().min(0).default(0),
  note:                     z.string().max(500).optional(),
});

router.post("/:offerId/counter", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  const isBuyer = offer.buyerId === userId;
  const isSeller = offer.sellerId === userId;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: "forbidden" });

  // Verify it's the caller's turn.
  if (isSeller && offer.currentTurn !== "seller") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to counter" });
  }
  if (isBuyer && offer.currentTurn !== "buyer") {
    return res.status(409).json({ error: "conflict", message: "Not your turn to counter" });
  }
  if (!(ACTIVE_OFFER_STATUSES as readonly string[]).includes(offer.status)) {
    return res.status(409).json({ error: "conflict", message: `Cannot counter an offer with status ${offer.status}` });
  }
  if (offer.roundCount >= MAX_OFFER_ROUNDS) {
    return res.status(409).json({ error: "conflict", message: `Maximum negotiation rounds (${MAX_OFFER_ROUNDS}) reached` });
  }

  const parsed = counterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { buyerListingIds, sellerListingIds, buyerCashTopUpCents, sellerCashRequestedCents, note } = parsed.data;

  // Validate ownership: buyer listings must belong to buyer, seller listings to seller.
  const allListingIds = [...buyerListingIds, ...sellerListingIds];
  const listings = await db.query.listingsTable.findMany({
    where: (t, { inArray }) => inArray(t.id, allListingIds),
    columns: { id: true, userId: true, status: true },
  });
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  for (const id of buyerListingIds) {
    const l = listingMap.get(id);
    if (!l) return res.status(400).json({ error: "bad_request", message: `Listing ${id} not found` });
    if (l.userId !== offer.buyerId) return res.status(400).json({ error: "bad_request", message: `Listing ${id} does not belong to the buyer` });
    if (l.status !== "active") return res.status(409).json({ error: "conflict", message: `Listing ${id} is no longer active` });
  }
  for (const id of sellerListingIds) {
    const l = listingMap.get(id);
    if (!l) return res.status(400).json({ error: "bad_request", message: `Listing ${id} not found` });
    if (l.userId !== offer.sellerId) return res.status(400).json({ error: "bad_request", message: `Listing ${id} does not belong to the seller` });
    if (l.status !== "active") return res.status(409).json({ error: "conflict", message: `Listing ${id} is no longer active` });
  }

  // Supersede the current pending round.
  const currentRound = await db.query.offerRoundsTable.findFirst({
    where: and(eq(offerRoundsTable.offerId, offerId), eq(offerRoundsTable.status, "pending")),
    orderBy: [desc(offerRoundsTable.roundNumber)],
  });
  if (currentRound) {
    await db.update(offerRoundsTable).set({ status: "superseded", updatedAt: new Date() }).where(eq(offerRoundsTable.id, currentRound.id));
  }

  const nextRoundNumber = offer.roundCount + 1;
  const nextTurn = isBuyer ? "seller" : "buyer";

  // Insert the new round.
  const [newRound] = await db.insert(offerRoundsTable).values({
    offerId: offer.id,
    roundNumber: nextRoundNumber,
    proposedBy: isBuyer ? "buyer" : "seller",
    buyerCashTopUpCents,
    sellerCashRequestedCents,
    note: note ?? null,
  }).returning();

  await db.insert(offerRoundItemsTable).values([
    ...buyerListingIds.map((lid, i) => ({ offerRoundId: newRound.id, listingId: lid, side: "buyer" as const, position: i })),
    ...sellerListingIds.map((lid, i) => ({ offerRoundId: newRound.id, listingId: lid, side: "seller" as const, position: i })),
  ]);

  await db.update(offersTable).set({
    status: "countered",
    currentTurn: nextTurn,
    roundCount: nextRoundNumber,
    updatedAt: new Date(),
  }).where(eq(offersTable.id, offer.id));

  const notifyUserId = isBuyer ? offer.sellerId : offer.buyerId;
  await db.insert(notificationsTable).values({
    userId: notifyUserId, type: "counter_received",
    title: "Counter-offer received", body: "New terms proposed. Review and respond.",
    relatedOfferId: offer.id,
  });
  // Counter card focuses on the sender's side ("What changed").
  const theirListingIds = isBuyer ? buyerListingIds : sellerListingIds;
  void (async () => {
    const payload = await buildCounterOfferPush({
      offerId: offer.id,
      senderUserId: userId,
      theirListingIds,
    });
    await sendPushToUser(notifyUserId, payload);
  })().catch(console.error);
  return res.status(201).json(serializeOfferRound({ ...newRound, items: [] }));
});

// ─── GET /api/offers/:offerId/counter ─────────────────────────────────────────
router.get("/:offerId/counter", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub && offer.sellerId !== req.user!.sub) {
    return res.status(403).json({ error: "forbidden" });
  }

  const latestRound = await getLatestRound(offerId);
  if (!latestRound) return res.status(404).json({ error: "not_found" });
  return res.json(latestRound);
});

// ─── POST /api/offers/:offerId/counter/accept ─────────────────────────────────
// Backward-compatibility alias — same turn-based logic as POST /accept.
router.post("/:offerId/counter/accept", requireAuth, (req, res) =>
  handleAccept(p(req.params["offerId"]), req.user!.sub, res),
);

// ─── POST /api/offers/:offerId/counter/deny ───────────────────────────────────
// Backward-compatibility alias — same turn-based logic as POST /deny.
router.post("/:offerId/counter/deny", requireAuth, (req, res) =>
  handleDeny(p(req.params["offerId"]), req.user!.sub, res),
);

export default router;
