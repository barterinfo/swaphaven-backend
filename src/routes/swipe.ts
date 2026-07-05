import { Router } from "express";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { swipesTable, swipeStreaksTable, listingsTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";

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
    orderBy: sql`RANDOM()`,
  });

  // Fetch the viewer's own active listings so we can compute mutual-fit scores.
  // We consider what the viewer *has* (their listing categories) as what they can offer.
  const myListings = await db.query.listingsTable.findMany({
    where: and(
      eq(listingsTable.userId, userId),
      eq(listingsTable.status, "active"),
    ),
    columns: { category: true, wantedCategories: true },
  });

  // Build a lowercase set of category labels the viewer can offer.
  const myOfferCategories = new Set<string>(
    myListings.map((l) => l.category.trim().toLowerCase()),
  );

  function computeMatchScore(wantedCategories: string[]): {
    mutualFitScore: number;
    matchedWantedLabels: string[];
    matchReason: string | null;
  } {
    if (!wantedCategories.length || !myOfferCategories.size) {
      return { mutualFitScore: 0, matchedWantedLabels: [], matchReason: null };
    }
    const matched = wantedCategories.filter((w) =>
      myOfferCategories.has(w.trim().toLowerCase()),
    );
    const score = matched.length / wantedCategories.length;
    const reason =
      matched.length > 0
        ? `You have items in: ${matched.join(", ")}`
        : null;
    return { mutualFitScore: score, matchedWantedLabels: matched, matchReason: reason };
  }

  const streak = await db.query.swipeStreaksTable.findFirst({
    where: eq(swipeStreaksTable.userId, userId),
  });

  return res.json({
    cards: cards.map((c) => {
      const { mutualFitScore, matchedWantedLabels, matchReason } =
        computeMatchScore(c.wantedCategories ?? []);
      return {
        listing: c,
        matchReason,
        mutualFitScore,
        matchedWantedLabels,
        hotCount: c.rightSwipeCount,
      };
    }),
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

  // Increment the denormalized counter only when a new right-swipe was recorded.
  // onConflictDoNothing returns nothing on a duplicate, so swipe being defined
  // guarantees we're counting each (user, listing) pair at most once.
  if (swipe && direction === "right") {
    try {
      await db.update(listingsTable)
        .set({ rightSwipeCount: sql`${listingsTable.rightSwipeCount} + 1` })
        .where(eq(listingsTable.id, listingId));
    } catch (err) {
      console.error("[swipe] right_swipe_count increment failed:", err);
      throw err;
    }
  }

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
