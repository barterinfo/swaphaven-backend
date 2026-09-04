import { Router } from "express";
import { and, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import {
  swipesTable,
  swipeStreaksTable,
  listingsTable,
  categoriesTable,
  savedListingsTable,
  userProfilesTable,
} from "../db/schema/index.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import { computeMatchScore } from "../lib/match-score.js";
import { hiddenOwnerIds, isBlockedEitherWay } from "../lib/user-blocks.js";
import {
  normalizeCountryCode,
  resolveRequestCountry,
} from "../lib/geo-country.js";

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
// Public browse (5.1.1). Recording a swipe still requires auth.
router.get("/deck", optionalAuth, async (req, res) => {
  const parsedQuery = deckQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      error: "validation",
      message: parsedQuery.error.flatten().fieldErrors,
    });
  }

  const userId = req.user?.sub ?? null;
  const clientExcludeIds = parsedQuery.data.excludeIds;
  const categorySlug = parsedQuery.data.category;

  // Country scopes the deck. Signed-in: saved profile, else infer + persist.
  // Guests: CDN country header, else Singapore — do not write a profile.
  let viewerCountry = userId
    ? normalizeCountryCode(
        (
          await db.query.userProfilesTable.findFirst({
            where: eq(userProfilesTable.id, userId),
            columns: { locationCountry: true },
          })
        )?.locationCountry,
      )
    : null;
  if (!viewerCountry) {
    viewerCountry = resolveRequestCountry(req).country;
    if (userId) {
      await db
        .update(userProfilesTable)
        .set({ locationCountry: viewerCountry, updatedAt: new Date() })
        .where(eq(userProfilesTable.id, userId));
    }
  }

  const excludeIds = [...clientExcludeIds];
  if (userId) {
    const alreadySwiped = await db
      .select({ listingId: swipesTable.listingId })
      .from(swipesTable)
      .where(eq(swipesTable.swiperId, userId));

    const activeOfferListingIds = await getActiveNegotiationListingIds(userId);
    excludeIds.push(
      ...alreadySwiped.map((s) => s.listingId),
      ...activeOfferListingIds,
    );
  }

  const uniqueExcludeIds = [...new Set(excludeIds)];

  // Legacy listings may have empty location_country; include them so they
  // appear in swipe the same way they already appear in nearby/trending.
  const conditions: Parameters<typeof and>[0][] = [
    eq(listingsTable.status, "active"),
    or(
      eq(listingsTable.locationCountry, viewerCountry),
      eq(listingsTable.locationCountry, ""),
    ),
  ];
  if (userId) {
    conditions.push(sql`${listingsTable.userId} != ${userId}`);
  }
  if (uniqueExcludeIds.length) {
    conditions.push(notInArray(listingsTable.id, uniqueExcludeIds));
  }

  if (userId) {
    const hiddenOwners = await hiddenOwnerIds(userId);
    if (hiddenOwners.length) {
      conditions.push(notInArray(listingsTable.userId, hiddenOwners));
    }
  }

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

  const myOfferCategories = new Set<string>();
  let remainingSwipesToday = UNLIMITED_REMAINING;
  let bonusSwipesAvailable = 0;
  let superlikesRemaining = 0;
  const savedIds = new Set<string>();

  if (userId) {
    const myListings = await db.query.listingsTable.findMany({
      where: and(
        eq(listingsTable.userId, userId),
        eq(listingsTable.status, "active"),
      ),
      columns: { category: true, wantedCategories: true },
    });
    for (const listing of myListings) {
      myOfferCategories.add(listing.category.trim().toLowerCase());
    }

    const [streak, swipesToday] = await Promise.all([
      db.query.swipeStreaksTable.findFirst({
        where: eq(swipeStreaksTable.userId, userId),
      }),
      countSwipesToday(userId),
    ]);
    remainingSwipesToday = remainingDailySwipes(swipesToday);
    bonusSwipesAvailable = streak?.bonusSwipesRemaining ?? 0;

    try {
      if (cards.length) {
        const savedRows = await db
          .select({ listingId: savedListingsTable.listingId })
          .from(savedListingsTable)
          .where(
            and(
              eq(savedListingsTable.userId, userId),
              inArray(
                savedListingsTable.listingId,
                cards.map((c) => c.id),
              ),
            ),
          );
        for (const row of savedRows) savedIds.add(row.listingId);
      }
    } catch (err) {
      console.error("[swipe/deck] saved_listings lookup failed:", err);
    }

    try {
      const profile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.id, userId),
        columns: { superlikesRemaining: true },
      });
      superlikesRemaining = profile?.superlikesRemaining ?? 2;
    } catch (err) {
      console.error("[swipe/deck] superlikesRemaining lookup failed:", err);
    }
  }

  return res.json({
    cards: cards.map((c) => {
      const { mutualFitScore, matchedWantedLabels, matchReason } =
        computeMatchScore(c.wantedCategories ?? [], myOfferCategories);
      const { user, ...listing } = c;
      const ownerName = user?.profile?.displayName?.trim() || user?.name?.trim() || "";
      return {
        listing: { ...listing, ownerName, is_saved: savedIds.has(c.id) },
        matchReason,
        mutualFitScore,
        matchedWantedLabels,
        hotCount: c.rightSwipeCount,
        is_saved: savedIds.has(c.id),
      };
    }),
    remainingSwipesToday,
    bonusSwipesAvailable,
    superlikesRemaining,
    refreshesAt: refreshesAtIso(),
  });
});

// ─── POST /api/swipe/recycle-left ─────────────────────────────────────────────
// Reset this viewer's left-passes so those listings are unseen again.
// Right/super rows are not touched.
router.post("/recycle-left", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const deleted = await db
    .delete(swipesTable)
    .where(and(eq(swipesTable.swiperId, userId), eq(swipesTable.direction, "left")))
    .returning({ id: swipesTable.id });
  return res.json({ recycledCount: deleted.length });
});

// ─── POST /api/swipe ──────────────────────────────────────────────────────────
const swipeSchema = z.object({
  listingId: z.string().uuid(),
  direction: z.enum(["left", "right", "super"]),
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
  if (await isBlockedEitherWay(userId, listing.userId)) {
    return res.status(403).json({
      error: "forbidden",
      message: "You cannot interact with this user",
    });
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

  // Super-swipe is a separate quota from the daily swipe limit.
  // Only load the column when needed so left/right still work if migration is pending.
  let profileSuperlikes: number | null = null;
  if (direction === "super") {
    try {
      const profile = await db.query.userProfilesTable.findFirst({
        where: eq(userProfilesTable.id, userId),
        columns: { superlikesRemaining: true },
      });
      profileSuperlikes = profile?.superlikesRemaining ?? 0;
    } catch (err) {
      console.error("[swipe] superlikesRemaining lookup failed:", err);
      return res.status(503).json({
        error: "schema_pending",
        message: "Super like is temporarily unavailable. Try again after deploy migrations.",
      });
    }
    if (profileSuperlikes <= 0) {
      return res.status(429).json({
        error: "superlike_limit",
        message: "Super like is finished",
        superlikesRemaining: 0,
      });
    }
  }

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

  // Increment the denormalized counter for any right-leaning swipe (right or super).
  if (swipe && (direction === "right" || direction === "super")) {
    try {
      await db.update(listingsTable)
        .set({ rightSwipeCount: sql`${listingsTable.rightSwipeCount} + 1` })
        .where(eq(listingsTable.id, listingId));
    } catch (err) {
      console.error("[swipe] right_swipe_count increment failed:", err);
      throw err;
    }
  }

  // Decrement superlike quota after a confirmed super-swipe insert.
  let superlikesRemaining: number | undefined;
  if (direction === "super" && swipe) {
    const newRemaining = Math.max(0, (profileSuperlikes ?? 0) - 1);
    try {
      await db.update(userProfilesTable)
        .set({ superlikesRemaining: newRemaining })
        .where(eq(userProfilesTable.id, userId));
      superlikesRemaining = newRemaining;
    } catch (err) {
      console.error("[swipe] superlikesRemaining decrement failed:", err);
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
    ...(superlikesRemaining !== undefined ? { superlikesRemaining } : {}),
  });
});

// ─── DELETE /api/swipe/:swipeId ───────────────────────────────────────────────
// Undo a left (pass) swipe so the listing can reappear in the deck.
const undoSwipeParamsSchema = z.object({
  swipeId: z.string().uuid(),
});

router.delete("/:swipeId", requireAuth, async (req, res) => {
  const parsed = undoSwipeParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const { swipeId } = parsed.data;
  const userId = req.user!.sub;

  const swipe = await db.query.swipesTable.findFirst({
    where: eq(swipesTable.id, swipeId),
  });
  if (!swipe) {
    return res.status(404).json({ error: "not_found", message: "Swipe not found" });
  }
  if (swipe.swiperId !== userId) {
    return res.status(403).json({ error: "forbidden", message: "Not your swipe" });
  }
  if (swipe.direction !== "left") {
    return res.status(400).json({
      error: "bad_request",
      message: "Only left (pass) swipes can be undone",
    });
  }

  const swipesTodayBefore = await countSwipesToday(userId);
  const dailyLimit = env.DAILY_SWIPE_LIMIT;
  const consumedBonus =
    dailyLimit != null && swipesTodayBefore > dailyLimit;

  await db.delete(swipesTable).where(eq(swipesTable.id, swipeId));

  let bonusSwipesAvailable = 0;
  const streak = await db.query.swipeStreaksTable.findFirst({
    where: eq(swipeStreaksTable.userId, userId),
  });
  if (streak) {
    bonusSwipesAvailable = streak.bonusSwipesRemaining;
    if (consumedBonus) {
      bonusSwipesAvailable = streak.bonusSwipesRemaining + 1;
      await db
        .update(swipeStreaksTable)
        .set({ bonusSwipesRemaining: bonusSwipesAvailable })
        .where(eq(swipeStreaksTable.userId, userId));
    }
  }

  const swipesTodayAfter = await countSwipesToday(userId);
  return res.json({
    swipeId,
    listingId: swipe.listingId,
    remainingSwipesToday: remainingDailySwipes(swipesTodayAfter),
    bonusSwipesAvailable,
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
