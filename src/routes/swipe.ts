import { Router } from "express";
import { and, eq, gte, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import {
  swipesTable,
  swipeStreaksTable,
  listingsTable,
  categoriesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";

const router = Router();

/** Cards returned per GET /api/swipe/deck request (independent of daily quota). */
const DECK_PAGE_SIZE = 20;

/** Sentinel remaining count when DAILY_SWIPE_LIMIT is unset (unlimited). */
const UNLIMITED_REMAINING = Number.MAX_SAFE_INTEGER;

function startOfLocalDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function refreshesAtIso(): string {
  return new Date(new Date().setHours(24, 0, 0, 0)).toISOString();
}

/** Remaining daily swipes. Unlimited when `env.DAILY_SWIPE_LIMIT` is null. */
function remainingDailySwipes(swipesToday: number): number {
  const limit = env.DAILY_SWIPE_LIMIT;
  if (limit == null) return UNLIMITED_REMAINING;
  return Math.max(0, limit - swipesToday);
}

async function countSwipesToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(swipesTable)
    .where(
      and(
        eq(swipesTable.swiperId, userId),
        gte(swipesTable.createdAt, startOfLocalDay()),
      ),
    );
  return row?.value ?? 0;
}

const deckQuerySchema = z.object({
  excludeIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v == null) return [] as string[];
      const parts = (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(","));
      return [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
    })
    .pipe(z.array(z.string().uuid())),
  /** Browse category slug (e.g. `electronics`). Omit or `all` for unfiltered. */
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (v == null || v === "" || v.toLowerCase() === "all") return undefined;
      return v;
    }),
});

// ─── GET /api/swipe/deck ──────────────────────────────────────────────────────
router.get("/deck", requireAuth, async (req, res) => {
  const parsedQuery = deckQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: "validation",
      message: parsedQuery.error.flatten().fieldErrors,
    });
  }

  const userId = req.user!.sub;
  const clientExcludeIds = parsedQuery.data.excludeIds;
  const categorySlug = parsedQuery.data.category;

  const alreadySwiped = await db
    .select({ listingId: swipesTable.listingId })
    .from(swipesTable)
    .where(eq(swipesTable.swiperId, userId));

  const activeOfferListingIds = await getActiveNegotiationListingIds(userId);

  const excludeIds = [
    ...new Set([
      ...alreadySwiped.map((s) => s.listingId),
      ...activeOfferListingIds,
      ...clientExcludeIds,
    ]),
  ];

  const conditions: Parameters<typeof and>[0][] = [
    eq(listingsTable.status, "active"),
    sql`${listingsTable.userId} != ${userId}`,
  ];
  if (excludeIds.length) conditions.push(notInArray(listingsTable.id, excludeIds));

  if (categorySlug) {
    // Browse bar sends slug (`electronics`); resolve once to categories.id.
    const catRow = await db.query.categoriesTable.findFirst({
      where: or(
        eq(categoriesTable.slug, categorySlug),
        sql`lower(${categoriesTable.name}) = ${categorySlug.toLowerCase()}`,
      ),
      columns: { id: true },
    });
    if (catRow) {
      conditions.push(eq(listingsTable.categoryId, catRow.id));
    } else {
      conditions.push(sql`false`);
    }
  }

  const cards = await db.query.listingsTable.findMany({
    where: and(...conditions),
    with: {
      images: true,
      categoryRow: true,
      wants: true,
      user: {
        columns: { id: true, name: true },
        with: { profile: { columns: { displayName: true } } },
      },
    },
    limit: DECK_PAGE_SIZE,
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

  const [streak, swipesToday] = await Promise.all([
    db.query.swipeStreaksTable.findFirst({
      where: eq(swipeStreaksTable.userId, userId),
    }),
    countSwipesToday(userId),
  ]);

  return res.json({
    cards: cards.map((c) => {
      const { mutualFitScore, matchedWantedLabels, matchReason } =
        computeMatchScore(c.wantedCategories ?? []);
      const { user, ...listing } = c;
      const ownerName = user?.profile?.displayName?.trim() || user?.name?.trim() || "";
      return {
        listing: { ...listing, ownerName },
        matchReason,
        mutualFitScore,
        matchedWantedLabels,
        hotCount: c.rightSwipeCount,
      };
    }),
    remainingSwipesToday: remainingDailySwipes(swipesToday),
    bonusSwipesAvailable: streak?.bonusSwipesRemaining ?? 0,
    refreshesAt: refreshesAtIso(),
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
  const userId = req.user!.sub;

  // Validate listing exists and is not the user's own
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId === userId) {
    return res.status(400).json({ error: "bad_request", message: "Cannot swipe on your own listing" });
  }

  const activeOfferListingIds = await getActiveNegotiationListingIds(userId);
  if (activeOfferListingIds.includes(listingId)) {
    return res.status(409).json({
      error: "conflict",
      message: "Listing is already in an active offer negotiation",
    });
  }

  // Idempotent: already-swiped pairs do not consume quota again.
  const existingSwipe = await db.query.swipesTable.findFirst({
    where: and(eq(swipesTable.swiperId, userId), eq(swipesTable.listingId, listingId)),
  });
  if (existingSwipe) {
    return res.status(201).json({
      swipeId: existingSwipe.id,
      direction: existingSwipe.direction,
      streakUpdated: false,
      newStreakCount: null,
    });
  }

  const [swipesToday, streak] = await Promise.all([
    countSwipesToday(userId),
    db.query.swipeStreaksTable.findFirst({
      where: eq(swipeStreaksTable.userId, userId),
    }),
  ]);
  const remainingSwipesToday = remainingDailySwipes(swipesToday);
  const bonusSwipes = streak?.bonusSwipesRemaining ?? 0;
  const dailyLimited = env.DAILY_SWIPE_LIMIT != null;

  if (dailyLimited && remainingSwipesToday <= 0 && bonusSwipes <= 0) {
    return res.status(429).json({
      error: "daily_limit",
      message: "Daily swipe limit reached",
      refreshesAt: refreshesAtIso(),
    });
  }

  const [swipe] = await db
    .insert(swipesTable)
    .values({ swiperId: userId, listingId, direction })
    .returning();

  // Increment the denormalized counter only when a new right-swipe was recorded.
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

  // Streak + bonus: daily quota first; bonus is consumed only after the daily
  // quota is exhausted. Keep streak/bonus updates in a single write when possible.
  const today = new Date().toISOString().slice(0, 10);
  const existing = streak;
  const consumeBonus =
    dailyLimited && remainingSwipesToday <= 0 && bonusSwipes > 0;

  let newStreakCount: number | null = null;
  let streakUpdated = false;

  if (!existing) {
    await db.insert(swipeStreaksTable).values({
      userId,
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
    const baseBonus = consumeBonus ? bonusSwipes - 1 : existing.bonusSwipesRemaining;
    const awardedBonus = newStreak % 7 === 0 ? baseBonus + 5 : baseBonus;

    await db.update(swipeStreaksTable)
      .set({
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, existing.longestStreak),
        lastSwipeDate: today,
        bonusSwipesRemaining: awardedBonus,
      })
      .where(eq(swipeStreaksTable.userId, userId));

    newStreakCount = newStreak;
    streakUpdated = true;

    if (newStreak % 7 === 0) {
      console.info(`[streak] User ${userId} hit ${newStreak}-day streak milestone!`);
    }
  } else if (consumeBonus) {
    await db.update(swipeStreaksTable)
      .set({ bonusSwipesRemaining: bonusSwipes - 1 })
      .where(eq(swipeStreaksTable.userId, userId));
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
