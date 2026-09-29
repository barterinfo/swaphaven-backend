import { Router } from "express";
import { and, count, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  userProfilesTable,
  listingsTable,
  tradeReviewsTable,
  tradesTable,
  offersTable,
  userFollowsTable,
  usersTable,
} from "../db/schema/index.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p, toDecimalStr } from "../lib/route-helpers.js";
import { findProfaneField } from "../lib/moderation.js";
import { refreshCompletionRate } from "../lib/profile-stats.js";
import { isBlockedEitherWay } from "../lib/user-blocks.js";

const router = Router();

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  await refreshCompletionRate(userId);

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, userId),
  });
  if (!profile) return res.status(404).json({ error: "not_found", message: "Profile not found" });

  const [followerCountRow, followingCountRow] = await Promise.all([
    db
      .select({ total: count() })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followeeId, userId))
      .then((r) => r[0]!),
    db
      .select({ total: count() })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followerId, userId))
      .then((r) => r[0]!),
  ]);

  return res.json({
    ...profile,
    followerCount: Number(followerCountRow.total),
    followingCount: Number(followingCountRow.total),
  });
});

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
// Only user-editable profile fields. Stats (totalTrades, ratingSum, ratingCount,
// tradeScore, isPhoneVerified, completionRate, avgResponseMinutes) are managed
// exclusively by server-side flows and are intentionally absent here.
const updateProfileSchema = z.object({
  displayName:  z.string().min(1).max(80).optional(),
  bio:          z.string().max(500).optional(),
  avatarUrl:    z.string().max(2048).optional(),
  locationCity: z.string().max(100).optional(),
  /** ISO-3166-1 alpha-2 (e.g. SG, NZ). Empty string clears. */
  locationCountry: z
    .string()
    .max(2)
    .optional()
    .transform((v) => (v == null ? undefined : v.trim().toUpperCase()))
    .refine((v) => v === undefined || v === "" || /^[A-Z]{2}$/.test(v), {
      message: "locationCountry must be a 2-letter ISO country code",
    }),
  locationLat:  z.number().min(-90).max(90).optional(),
  locationLng:  z.number().min(-180).max(180).optional(),
  /** Onboarding interest slugs (e.g. electronics). */
  interestCategoryIds: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const profaneField = findProfaneField([
    { field: "displayName", value: parsed.data.displayName },
    { field: "bio", value: parsed.data.bio },
  ]);
  if (profaneField) {
    return res.status(400).json({
      error: "moderation",
      message: `${profaneField} contains inappropriate language and cannot be used.`,
    });
  }

  const { locationLat, locationLng, locationCountry, ...rest } = parsed.data;
  const [updated] = await db
    .update(userProfilesTable)
    .set({
      ...rest,
      ...(locationCountry !== undefined ? { locationCountry } : {}),
      locationLat: toDecimalStr(locationLat),
      locationLng: toDecimalStr(locationLng),
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.id, req.user!.sub))
    .returning();

  if (!updated) return res.status(404).json({ error: "not_found", message: "Profile not found" });
  return res.json(updated);
});

// ─── GET /api/users/me/following ──────────────────────────────────────────────
/** People the caller follows, newest first. */
router.get("/me/following", requireAuth, async (req, res) => {
  const followerId = req.user!.sub;
  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);

  const conditions = [eq(userFollowsTable.followerId, followerId)];
  if (cursor) {
    conditions.push(lt(userFollowsTable.createdAt, cursor));
  }

  const rows = await db
    .select({
      userId:      userFollowsTable.followeeId,
      followedAt:  userFollowsTable.createdAt,
      displayName: userProfilesTable.displayName,
      avatarUrl:   userProfilesTable.avatarUrl,
    })
    .from(userFollowsTable)
    .innerJoin(userProfilesTable, eq(userProfilesTable.id, userFollowsTable.followeeId))
    .where(and(...conditions))
    .orderBy(desc(userFollowsTable.createdAt))
    .limit(limit);

  const nextCursor =
    rows.length === limit ? encodeCursor(rows.at(-1)!.followedAt) : null;

  return res.json({
    items: rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      followedAt: r.followedAt,
    })),
    nextCursor,
  });
});

// ─── POST /api/users/:userId/follow ───────────────────────────────────────────
/** Follow another user. Idempotent. Rejects self-follow and block relationships. */
router.post("/:userId/follow", requireAuth, async (req, res) => {
  const followerId = req.user!.sub;
  const followeeId = p(req.params["userId"]);

  if (followerId === followeeId) {
    return res.status(400).json({
      error: "bad_request",
      message: "Cannot follow yourself",
    });
  }

  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, followeeId),
    columns: { id: true },
  });
  if (!target) {
    return res.status(404).json({ error: "not_found", message: "User not found" });
  }

  if (await isBlockedEitherWay(followerId, followeeId)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Cannot follow this user",
    });
  }

  const existing = await db.query.userFollowsTable.findFirst({
    where: and(
      eq(userFollowsTable.followerId, followerId),
      eq(userFollowsTable.followeeId, followeeId),
    ),
  });
  if (existing) {
    return res.status(200).json({
      id: existing.id,
      followeeId,
      following: true,
    });
  }

  const [row] = await db
    .insert(userFollowsTable)
    .values({ followerId, followeeId })
    .returning();

  return res.status(201).json({
    id: row!.id,
    followeeId,
    following: true,
  });
});

// ─── DELETE /api/users/:userId/follow ─────────────────────────────────────────
/** Unfollow. Idempotent — 204 even if not following. */
router.delete("/:userId/follow", requireAuth, async (req, res) => {
  const followerId = req.user!.sub;
  const followeeId = p(req.params["userId"]);

  await db
    .delete(userFollowsTable)
    .where(
      and(
        eq(userFollowsTable.followerId, followerId),
        eq(userFollowsTable.followeeId, followeeId),
      ),
    );

  return res.status(204).send();
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────
router.get("/:userId", optionalAuth, async (req, res) => {
  const userId = p(req.params["userId"]);
  let profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, userId),
  });
  if (!profile) return res.status(404).json({ error: "not_found", message: "User not found" });

  await refreshCompletionRate(userId);
  profile = (await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, userId),
  }))!;

  const viewerId = req.user?.sub;
  const [followerCountRow, followingCountRow, followRow] = await Promise.all([
    db
      .select({ total: count() })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followeeId, userId))
      .then((r) => r[0]!),
    db
      .select({ total: count() })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followerId, userId))
      .then((r) => r[0]!),
    viewerId && viewerId !== userId
      ? db.query.userFollowsTable.findFirst({
          where: and(
            eq(userFollowsTable.followerId, viewerId),
            eq(userFollowsTable.followeeId, userId),
          ),
          columns: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const { locationLat } = profile;
  const rating =
    profile.ratingCount > 0
      ? Math.round((profile.ratingSum / profile.ratingCount) * 10) / 10
      : null;
  return res.json({
    id: profile.id,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    locationCity: profile.locationCity,
    hasLocation: locationLat != null,
    totalTrades: profile.totalTrades,
    rating,
    ratingCount: profile.ratingCount,
    isVerified: profile.isVerified,
    isPhoneVerified: profile.isPhoneVerified,
    completionRate: profile.completionRate,
    avgResponseMinutes: profile.avgResponseMinutes,
    createdAt: profile.createdAt,
    followerCount: Number(followerCountRow.total),
    followingCount: Number(followingCountRow.total),
    isFollowing: viewerId && viewerId !== userId ? Boolean(followRow) : false,
  });
});

// ─── GET /api/users/:userId/listings ─────────────────────────────────────────
router.get("/:userId/listings", async (req, res) => {
  const userId = p(req.params["userId"]);
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);

  const activeFilter = and(
    eq(listingsTable.userId, userId),
    ne(listingsTable.status, "deleted"),
  );

  const [totalRow, rawItems] = await Promise.all([
    db
      .select({ total: count() })
      .from(listingsTable)
      .where(activeFilter)
      .then((r) => r[0]!),
    db.query.listingsTable.findMany({
      where: activeFilter,
      with: { images: true, categoryRow: true },
      limit,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    }),
  ]);

  const nextCursor = rawItems.length === limit ? encodeCursor(rawItems.at(-1)!.createdAt) : null;
  return res.json({ items: rawItems, nextCursor, total: Number(totalRow.total) });
});

// ─── GET /api/users/:userId/reviews ──────────────────────────────────────────
// Only returns revealed reviews: window closed OR both parties have submitted.
// Includes reviewer display name and avatar for profile display.
router.get("/:userId/reviews", async (req, res) => {
  const userId      = p(req.params["userId"]);
  const { limit }   = parsePaginationQuery(req.query as Record<string, unknown>);

  const items = await db
    .select({
      id:                  tradeReviewsTable.id,
      tradeId:             tradeReviewsTable.tradeId,
      reviewerId:          tradeReviewsTable.reviewerId,
      revieweeId:          tradeReviewsTable.revieweeId,
      rating:              tradeReviewsTable.rating,
      comment:             tradeReviewsTable.comment,
      tags:                tradeReviewsTable.tags,
      createdAt:           tradeReviewsTable.createdAt,
      reviewerDisplayName: userProfilesTable.displayName,
      reviewerAvatarUrl:   userProfilesTable.avatarUrl,
      tradeListingTitle:   listingsTable.title,
      listingThumbnailUrl: sql<string | null>`(
        SELECT li.url
        FROM listing_images li
        WHERE li.listing_id = ${listingsTable.id}
        ORDER BY li.position ASC
        LIMIT 1
      )`.as("listing_thumbnail_url"),
    })
    .from(tradeReviewsTable)
    .innerJoin(tradesTable, eq(tradesTable.id, tradeReviewsTable.tradeId))
    .innerJoin(offersTable, eq(offersTable.id, tradesTable.offerId))
    .innerJoin(listingsTable, eq(listingsTable.id, offersTable.listingId))
    .innerJoin(userProfilesTable, eq(userProfilesTable.id, tradeReviewsTable.reviewerId))
    .where(
      and(
        eq(tradeReviewsTable.revieweeId, userId),
        or(
          // Window has closed — reviews are public regardless of both submitting.
          // COALESCE covers completed trades that never got review_window_closes_at backfilled.
          sql`COALESCE(${tradesTable.reviewWindowClosesAt}, ${tradesTable.completedAt} + INTERVAL '7 days') < NOW()`,
          // Both parties submitted early — reveal immediately
          sql`(SELECT COUNT(*) FROM trade_reviews r2 WHERE r2.trade_id = ${tradeReviewsTable.tradeId}) >= 2`,
        ),
      ),
    )
    .orderBy(desc(tradeReviewsTable.createdAt))
    .limit(limit);

  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

export default router;
