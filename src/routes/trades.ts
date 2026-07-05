import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  tradesTable, tradeReviewsTable, offersTable, notificationsTable, userProfilesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p } from "../lib/route-helpers.js";
import { containsProfanity } from "../lib/moderation.js";

const router = Router();

// ─── GET /api/trades ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const userId = req.user!.sub;

  const userOffers = await db.query.offersTable.findMany({
    where: or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
    columns: { id: true },
  });
  const offerIds = userOffers.map((o) => o.id);
  if (!offerIds.length) return res.json({ items: [], nextCursor: null });

  const items = await db.query.tradesTable.findMany({
    where: inArray(tradesTable.offerId, offerIds),
    with: { offer: { with: { items: { with: { listing: { with: { images: true } } } } } } },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

// ─── GET /api/trades/:tradeId ─────────────────────────────────────────────────
router.get("/:tradeId", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: { with: { items: { with: { listing: { with: { images: true } } } } } }, reviews: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (trade.offer.buyerId !== userId && trade.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }
  return res.json(trade);
});

// ─── PATCH /api/trades/:tradeId/meetup ────────────────────────────────────────
const meetupSchema = z.object({
  meetupScheduledAt: z.coerce.date(),
  meetupLocation:    z.string().min(1).max(500),
});

router.patch("/:tradeId/meetup", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const parsed = meetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }
  if (containsProfanity(parsed.data.meetupLocation)) {
    return res.status(400).json({
      error: "moderation",
      message: "meetupLocation contains inappropriate language and cannot be used.",
    });
  }

  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (trade.offer.buyerId !== userId && trade.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const [updated] = await db
    .update(tradesTable)
    .set({
      meetupScheduledAt: parsed.data.meetupScheduledAt,
      meetupLocation: parsed.data.meetupLocation,
      updatedAt: new Date(),
    })
    .where(eq(tradesTable.id, tradeId))
    .returning();

  return res.json(updated);
});

// ─── POST /api/trades/:tradeId/complete ───────────────────────────────────────
router.post("/:tradeId/complete", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (trade.offer.buyerId !== userId && trade.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (trade.status !== "pending_meetup") {
    return res.status(409).json({ error: "conflict", message: `Trade is already ${trade.status}` });
  }

  const [updated] = await db
    .update(tradesTable)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(tradesTable.id, tradeId))
    .returning();

  const otherUserId = userId === trade.offer.buyerId ? trade.offer.sellerId : trade.offer.buyerId;
  await db.insert(notificationsTable).values({
    userId: otherUserId, type: "trade_completed",
    title: "Trade marked complete", body: "Your trade has been marked as completed. Leave a review!",
    relatedTradeId: trade.id,
  });
  return res.json(updated);
});

// ─── POST /api/trades/:tradeId/reviews ────────────────────────────────────────
const reviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

router.post("/:tradeId/reviews", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }
  if (containsProfanity(parsed.data.comment)) {
    return res.status(400).json({
      error: "moderation",
      message: "comment contains inappropriate language and cannot be used.",
    });
  }

  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });
  if (trade.status !== "completed") {
    return res.status(409).json({ error: "conflict", message: "Trade must be completed before leaving a review" });
  }

  const reviewerId = req.user!.sub;
  if (trade.offer.buyerId !== reviewerId && trade.offer.sellerId !== reviewerId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const alreadyReviewed = await db.query.tradeReviewsTable.findFirst({
    where: and(eq(tradeReviewsTable.tradeId, trade.id), eq(tradeReviewsTable.reviewerId, reviewerId)),
  });
  if (alreadyReviewed) {
    return res.status(409).json({ error: "conflict", message: "You have already reviewed this trade" });
  }

  const revieweeId = trade.offer.buyerId === reviewerId ? trade.offer.sellerId : trade.offer.buyerId;
  const [review] = await db
    .insert(tradeReviewsTable)
    .values({ tradeId: trade.id, reviewerId, revieweeId, ...parsed.data })
    .returning();

  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.id, revieweeId) });
  if (profile) {
    await db.update(userProfilesTable)
      .set({
        ratingSum: profile.ratingSum + parsed.data.rating,
        ratingCount: profile.ratingCount + 1,
        totalTrades: profile.totalTrades + 1,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.id, revieweeId));
  }

  await db.insert(notificationsTable).values({
    userId: revieweeId, type: "review_received",
    title: "You received a review",
    body: `Someone rated you ${parsed.data.rating}/5 for a recent trade.`,
    relatedTradeId: trade.id,
  });
  return res.status(201).json(review);
});

export default router;
