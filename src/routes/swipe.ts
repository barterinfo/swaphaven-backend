import { Router } from "express";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { swipesTable, swipeStreaksTable, listingsTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import { fetchRightSwipeCounts } from "../lib/right-swipe-count.js";

const router = Router();

const DAILY_SWIPE_LIMIT = 20;

// ─── GET /api/swipe/deck ──────────────────────────────────────────────────────
router.get("/deck", requireAuth, async (req, res) => {
  const userId = req.user!.sub;

  const alreadySwiped = await db
    .select({ listingId: swipesTable.listingId })
    .from(swipesTable)
    .where(eq(swipesTable.swiperId, userId));

  const activeOfferListingIds = await getActiveNegotiationListingIds(userId);

  const excludeIds = [
    ...new Set([
      ...alreadySwiped.map((s) => s.listingId),
      ...activeOfferListingIds,
    ]),
  ];

  const conditions: Parameters<typeof and>[0][] = [
    eq(listingsTable.status, "active"),
    sql`${listingsTable.userId} != ${userId}`,
  ];
  if (excludeIds.length) conditions.push(notInArray(listingsTable.id, excludeIds));

  const cards = await db.query.listingsTable.findMany({
    where: and(...conditions),
    with: { images: true, categoryRow: true, wants: true },
    limit: DAILY_SWIPE_LIMIT,
    // Replace with AI mutual-fit score in production
    orderBy: sql`RANDOM()`,
  });

  const streak = await db.query.swipeStreaksTable.findFirst({
    where: eq(swipeStreaksTable.userId, userId),
  });

  const deckCountMap = await fetchRightSwipeCounts(cards.map((c) => c.id));

  return res.json({
    cards: cards.map((c) => ({
      listing: { ...c, rightSwipeCount: deckCountMap.get(c.id) ?? 0 },
      matchReason: null,
      mutualFitScore: 0.5,  // Populate from AI service
      hotCount: deckCountMap.get(c.id) ?? 0,
    })),
    remainingSwipesToday: DAILY_SWIPE_LIMIT,
    bonusSwipesAvailable: streak?.bonusSwipesRemaining ?? 0,
    refreshesAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
  });
});

// ─── POST /api/swipe ──────────────────────────────────────────────────────────
const swipeSchema = z.object({
  listingId: z.string().uuid(),
  direction: z.enum(["left", "right"]),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = swipeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { listingId, direction } = parsed.data;

  // Validate listing exists and is not the user's own
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId === req.user!.sub) {
    return res.status(400).json({ error: "bad_request", message: "Cannot swipe on your own listing" });
  }

  const activeOfferListingIds = await getActiveNegotiationListingIds(req.user!.sub);
  if (activeOfferListingIds.includes(listingId)) {
    return res.status(409).json({
      error: "conflict",
      message: "Listing is already in an active offer negotiation",
    });
  }

  const [swipe] = await db
    .insert(swipesTable)
    .values({ swiperId: req.user!.sub, listingId, direction })
    .onConflictDoNothing()
    .returning();

  // Streak logic
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.query.swipeStreaksTable.findFirst({
    where: eq(swipeStreaksTable.userId, req.user!.sub),
  });

  let newStreakCount: number | null = null;
  let streakUpdated = false;

  if (!existing) {
    await db.insert(swipeStreaksTable).values({
      userId: req.user!.sub,
      currentStreak: 1,
      longestStreak: 1,
      lastSwipeDate: today,
      bonusSwipesRemaining: 0,
    });
    newStreakCount = 1;
    streakUpdated = true;
  } else if (existing.lastSwipeDate !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const newStreak = existing.lastSwipeDate === yesterday ? existing.currentStreak + 1 : 1;
    const bonusSwipes = newStreak % 7 === 0
      ? existing.bonusSwipesRemaining + 5
      : existing.bonusSwipesRemaining;

    await db.update(swipeStreaksTable)
      .set({
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, existing.longestStreak),
        lastSwipeDate: today,
        bonusSwipesRemaining: bonusSwipes,
      })
      .where(eq(swipeStreaksTable.userId, req.user!.sub));

    newStreakCount = newStreak;
    streakUpdated = true;

    // Notify on streak milestones
    if (newStreak % 7 === 0) {
      // Fire-and-forget: notification (extend with actual push service)
      console.info(`[streak] User ${req.user!.sub} hit ${newStreak}-day streak milestone!`);
    }
  }

  return res.status(201).json({
    swipeId: swipe?.id ?? null,
    direction,
    streakUpdated,
    newStreakCount,
  });
});

// ─── GET /api/swipe/streak ────────────────────────────────────────────────────
router.get("/streak", requireAuth, async (req, res) => {
  const streak = await db.query.swipeStreaksTable.findFirst({
    where: eq(swipeStreaksTable.userId, req.user!.sub),
  });
  return res.json(streak ?? {
    currentStreak: 0,
    longestStreak: 0,
    lastSwipeDate: null,
    bonusSwipesRemaining: 0,
  });
});

export default router;
