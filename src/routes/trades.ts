import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  tradesTable, tradeReviewsTable, offersTable, notificationsTable, userProfilesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import {
  REVIEW_WINDOW_MS,
  isReviewWindowOpen,
  resolveReviewWindowClosesAt,
} from "../lib/review-window.js";
import { p } from "../lib/route-helpers.js";

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

  const completedAt = new Date();
  // Review window: 7 days from completion. Both parties can review until this closes.
  const reviewWindowClosesAt = new Date(completedAt.getTime() + REVIEW_WINDOW_MS);

  const [updated] = await db
    .update(tradesTable)
    .set({ status: "completed", completedAt, reviewWindowClosesAt, updatedAt: new Date() })
    .where(eq(tradesTable.id, tradeId))
    .returning();

  const otherUserId = userId === trade.offer.buyerId ? trade.offer.sellerId : trade.offer.buyerId;
  await db.insert(notificationsTable).values({
    userId: otherUserId, type: "trade_completed",
    title: "Trade marked complete",
    body: "Your trade has been marked as completed. You have 7 days to leave a review!",
    relatedTradeId: trade.id,
  });
  return res.json(updated);
});

// ─── GET /api/trades/:tradeId/review-status ───────────────────────────────────
// Returns window metadata and each party's submission status.
// Reviews are sealed until both parties submit OR the 7-day window closes.
router.get("/:tradeId/review-status", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const userId = req.user!.sub;

  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true, reviews: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });
  if (trade.offer.buyerId !== userId && trade.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (trade.status !== "completed") {
    return res.status(409).json({ error: "conflict", message: "Trade is not completed" });
  }

  const myReview    = trade.reviews.find((r) => r.reviewerId === userId) ?? null;
  const theirReview = trade.reviews.find((r) => r.reviewerId !== userId) ?? null;
  const windowClosesAt = resolveReviewWindowClosesAt(trade);
  const windowOpen     = isReviewWindowOpen(trade);
  // Reviews reveal when both parties submit or the window closes
  const revealed       = !windowOpen || trade.reviews.length >= 2;

  return res.json({
    tradeId,
    windowClosesAt,
    windowOpen,
    revealed,
    myReview: myReview
      ? { submitted: true, submittedAt: myReview.createdAt }
      : { submitted: false, submittedAt: null },
    // Only expose that they submitted (not the content) until revealed
    theirReview: theirReview
      ? { submitted: true }
      : { submitted: false },
  });
});

// ─── GET /api/trades/:tradeId/reviews/mine ────────────────────────────────────
// Returns the current user's own review for this trade (always visible to the author).
router.get("/:tradeId/reviews/mine", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const userId  = req.user!.sub;

  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });
  if (trade.offer.buyerId !== userId && trade.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const review = await db.query.tradeReviewsTable.findFirst({
    where: and(eq(tradeReviewsTable.tradeId, tradeId), eq(tradeReviewsTable.reviewerId, userId)),
  });
  if (!review) return res.status(404).json({ error: "not_found" });
  return res.json(review);
});

// ─── POST /api/trades/:tradeId/reviews ────────────────────────────────────────
const reviewSchema = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  tags:    z.array(z.string().max(50)).max(10).default([]),
});

router.post("/:tradeId/reviews", requireAuth, async (req, res) => {
  const tradeId = p(req.params["tradeId"]);
  const parsed  = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const trade = await db.query.tradesTable.findFirst({
    where: eq(tradesTable.id, tradeId),
    with: { offer: true },
  });
  if (!trade) return res.status(404).json({ error: "not_found" });
  if (trade.status !== "completed") {
    return res.status(409).json({ error: "conflict", message: "Trade must be completed before leaving a review" });
  }

  // Enforce 7-day review window (derive from completedAt when close time was never stored)
  if (!isReviewWindowOpen(trade)) {
    return res.status(409).json({ error: "conflict", message: "The review window for this trade has closed" });
  }

  // Lazily backfill missing close timestamp so status/list endpoints stay consistent
  if (trade.reviewWindowClosesAt == null && trade.completedAt != null) {
    const reviewWindowClosesAt = resolveReviewWindowClosesAt(trade)!;
    await db
      .update(tradesTable)
      .set({ reviewWindowClosesAt, updatedAt: new Date() })
      .where(eq(tradesTable.id, tradeId));
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

  // Update reviewee's aggregate rating stats
  const profile = await db.query.userProfilesTable.findFirst({ where: eq(userProfilesTable.id, revieweeId) });
  if (profile) {
    await db.update(userProfilesTable)
      .set({
        ratingSum:   profile.ratingSum + parsed.data.rating,
        ratingCount: profile.ratingCount + 1,
        totalTrades: profile.totalTrades + 1,
        updatedAt:   new Date(),
      })
      .where(eq(userProfilesTable.id, revieweeId));
  }

  // Check whether both parties have now submitted — if so, reviews reveal immediately
  const allReviews = await db.query.tradeReviewsTable.findMany({
    where: eq(tradeReviewsTable.tradeId, trade.id),
    columns: { id: true },
  });
  const bothReviewed = allReviews.length >= 2;

  if (bothReviewed) {
    // Notify both parties that sealed reviews are now visible
    await db.insert(notificationsTable).values([
      {
        userId: reviewerId, type: "reviews_revealed",
        title: "Reviews revealed!",
        body:  "Both of you have submitted reviews. Head to your trade partner's profile to see their review of you.",
        relatedTradeId: trade.id,
      },
      {
        userId: revieweeId, type: "reviews_revealed",
        title: "Reviews revealed!",
        body:  "Both of you have submitted reviews. Head to your trade partner's profile to see their review of you.",
        relatedTradeId: trade.id,
      },
    ]);
  } else {
    // Let the reviewee know a review is waiting but still sealed
    await db.insert(notificationsTable).values({
      userId: revieweeId, type: "review_received",
      title: "A review is waiting for you",
      body:  "Your trade partner has submitted a review. Submit yours to reveal both, or wait until the window closes.",
      relatedTradeId: trade.id,
    });
  }

  return res.status(201).json(review);
});

export default router;
