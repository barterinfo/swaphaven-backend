import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  offersTable, offerItemsTable, counterOffersTable, counterOfferItemsTable,
  tradesTable, conversationsTable, notificationsTable, listingsTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p } from "../lib/route-helpers.js";
import { serializeOfferListItem } from "../lib/inbox-serializers.js";

const router = Router();

/** Relations needed to render an offer row in the mobile inbox. */
const offerListWith = {
  listing: {
    columns: { id: true, title: true, estimatedValue: true, estimatedValueCents: true },
    with: {
      images: true,
      user: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
    },
  },
  buyer: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
  seller: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
  items: { with: { listing: { columns: { id: true, title: true, estimatedValue: true, estimatedValueCents: true }, with: { images: true } } } },
} as const;

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

  await db.insert(offerItemsTable).values(
    offeredListingIds.map((lid, i) => ({ offerId: offer.id, listingId: lid, position: i })),
  );
  await db.insert(notificationsTable).values({
    userId: listing.userId,
    type: "offer_received",
    title: "New swap offer!",
    body: "Someone wants to trade for your item.",
    relatedOfferId: offer.id,
  });
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
    with: { items: { with: { listing: { with: { images: true } } } } },
  });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub && offer.sellerId !== req.user!.sub) {
    return res.status(403).json({ error: "forbidden" });
  }

  const counterOffer = await db.query.counterOffersTable.findFirst({
    where: eq(counterOffersTable.offerId, offer.id),
    with: { items: { with: { offerItem: true } } },
  });
  const conversation = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.offerId, offer.id),
  });
  return res.json({ ...offer, counterOffer, conversationId: conversation?.id ?? null });
});

// ─── POST /api/offers/:offerId/accept ─────────────────────────────────────────
router.post("/:offerId/accept", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.sellerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (offer.status !== "pending") {
    return res.status(409).json({ error: "conflict", message: `Offer is already ${offer.status}` });
  }

  await db.update(offersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));
  const [trade] = await db.insert(tradesTable).values({ offerId: offer.id }).returning();
  const [conv]  = await db.insert(conversationsTable).values({ offerId: offer.id }).returning();

  await db.insert(notificationsTable).values({
    userId: offer.buyerId, type: "offer_accepted",
    title: "Offer accepted! 🎉", body: "Your trade offer was accepted. Start chatting now.",
    relatedOfferId: offer.id, relatedTradeId: trade.id, relatedConversationId: conv.id,
  });
  return res.json({ ...trade, conversationId: conv.id });
});

// ─── POST /api/offers/:offerId/deny ───────────────────────────────────────────
router.post("/:offerId/deny", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.sellerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (offer.status !== "pending") {
    return res.status(409).json({ error: "conflict", message: `Offer is already ${offer.status}` });
  }

  await db.update(offersTable).set({ status: "denied", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));
  await db.insert(notificationsTable).values({
    userId: offer.buyerId, type: "offer_denied",
    title: "Offer declined", body: "The seller declined your swap offer.",
    relatedOfferId: offer.id,
  });
  return res.status(204).send();
});

// ─── POST /api/offers/:offerId/withdraw ───────────────────────────────────────
router.post("/:offerId/withdraw", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (!["pending", "countered"].includes(offer.status)) {
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
const counterSchema = z.object({
  includedOfferItemIds: z.array(z.string().uuid()).min(1),
  cashRequestedCents:   z.number().int().min(0).default(0),
  sellerNote:           z.string().max(500).optional(),
});

router.post("/:offerId/counter", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.sellerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (offer.status !== "pending") {
    return res.status(409).json({ error: "conflict", message: `Cannot counter an offer with status ${offer.status}` });
  }

  const parsed = counterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  await db.update(offersTable).set({ status: "countered", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));
  const [counter] = await db
    .insert(counterOffersTable)
    .values({ offerId: offer.id, sellerId: req.user!.sub, ...parsed.data })
    .returning();

  const allItems = await db.query.offerItemsTable.findMany({ where: eq(offerItemsTable.offerId, offer.id) });
  await db.insert(counterOfferItemsTable).values(
    allItems.map((item) => ({
      counterOfferId: counter.id,
      offerItemId: item.id,
      isIncluded: parsed.data.includedOfferItemIds.includes(item.id),
    })),
  );
  await db.insert(notificationsTable).values({
    userId: offer.buyerId, type: "counter_received",
    title: "Counter-offer received", body: "The seller proposed new terms. Review and respond.",
    relatedOfferId: offer.id,
  });
  return res.status(201).json(counter);
});

// ─── GET /api/offers/:offerId/counter ─────────────────────────────────────────
router.get("/:offerId/counter", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer) return res.status(404).json({ error: "not_found" });
  if (offer.buyerId !== req.user!.sub && offer.sellerId !== req.user!.sub) {
    return res.status(403).json({ error: "forbidden" });
  }

  const counter = await db.query.counterOffersTable.findFirst({
    where: eq(counterOffersTable.offerId, offerId),
    with: { items: { with: { offerItem: { with: { listing: { with: { images: true } } } } } } },
  });
  if (!counter) return res.status(404).json({ error: "not_found" });
  return res.json(counter);
});

// ─── POST /api/offers/:offerId/counter/accept ─────────────────────────────────
router.post("/:offerId/counter/accept", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer || offer.buyerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  const counter = await db.query.counterOffersTable.findFirst({
    where: eq(counterOffersTable.offerId, offerId),
  });
  if (!counter) return res.status(404).json({ error: "not_found", message: "No counter-offer found" });
  if (counter.status !== "pending") {
    return res.status(409).json({ error: "conflict", message: `Counter-offer is already ${counter.status}` });
  }

  await db.update(counterOffersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(counterOffersTable.id, counter.id));
  await db.update(offersTable).set({ status: "accepted", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));

  const [trade] = await db.insert(tradesTable).values({ offerId: offer.id, counterOfferId: counter.id }).returning();
  const existingConv = await db.query.conversationsTable.findFirst({ where: eq(conversationsTable.offerId, offer.id) });
  const conv = existingConv ?? (await db.insert(conversationsTable).values({ offerId: offer.id }).returning())[0];

  await db.insert(notificationsTable).values({
    userId: offer.sellerId, type: "counter_accepted",
    title: "Counter-offer accepted! 🎉", body: "The buyer accepted your counter. Time to arrange the swap.",
    relatedOfferId: offer.id, relatedTradeId: trade.id,
  });
  return res.json({ ...trade, conversationId: conv.id });
});

// ─── POST /api/offers/:offerId/counter/deny ───────────────────────────────────
router.post("/:offerId/counter/deny", requireAuth, async (req, res) => {
  const offerId = p(req.params["offerId"]);
  const offer = await db.query.offersTable.findFirst({ where: eq(offersTable.id, offerId) });
  if (!offer || offer.buyerId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  const counter = await db.query.counterOffersTable.findFirst({
    where: eq(counterOffersTable.offerId, offerId),
  });
  if (!counter) return res.status(404).json({ error: "not_found" });

  await db.update(counterOffersTable).set({ status: "denied", updatedAt: new Date() }).where(eq(counterOffersTable.id, counter.id));
  await db.update(offersTable).set({ status: "denied", updatedAt: new Date() }).where(eq(offersTable.id, offer.id));

  await db.insert(notificationsTable).values({
    userId: offer.sellerId, type: "counter_denied",
    title: "Counter-offer declined", body: "The buyer declined your counter-offer.",
    relatedOfferId: offer.id,
  });
  return res.status(204).send();
});

export default router;
