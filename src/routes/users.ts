import { Router } from "express";
import { and, count, desc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { userProfilesTable, listingsTable, tradeReviewsTable, tradesTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p, toDecimalStr } from "../lib/route-helpers.js";

const router = Router();

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get("/me", requireAuth, async (req, res) => {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, req.user!.sub),
  });
  if (!profile) return res.status(404).json({ error: "not_found", message: "Profile not found" });
  return res.json(profile);
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
  locationLat:  z.number().min(-90).max(90).optional(),
  locationLng:  z.number().min(-180).max(180).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { locationLat, locationLng, ...rest } = parsed.data;
  const [updated] = await db
    .update(userProfilesTable)
    .set({
      ...rest,
      locationLat: toDecimalStr(locationLat),
      locationLng: toDecimalStr(locationLng),
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.id, req.user!.sub))
    .returning();

  if (!updated) return res.status(404).json({ error: "not_found", message: "Profile not found" });
  return res.json(updated);
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────
router.get("/:userId", async (req, res) => {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, p(req.params["userId"])),
  });
  if (!profile) return res.status(404).json({ error: "not_found", message: "User not found" });

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
    isVerified: profile.isVerified,
    isPhoneVerified: profile.isPhoneVerified,
    completionRate: profile.completionRate,
    avgResponseMinutes: profile.avgResponseMinutes,
    createdAt: profile.createdAt,
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
    })
    .from(tradeReviewsTable)
    .innerJoin(tradesTable, eq(tradesTable.id, tradeReviewsTable.tradeId))
    .innerJoin(userProfilesTable, eq(userProfilesTable.id, tradeReviewsTable.reviewerId))
    .where(
      and(
        eq(tradeReviewsTable.revieweeId, userId),
        or(
          // Window has closed — reviews are public regardless of both submitting
          sql`${tradesTable.reviewWindowClosesAt} < NOW()`,
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
