import { Router } from "express";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { userProfilesTable, listingsTable, tradeReviewsTable } from "../db/schema/index.js";
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

  // lat/lng are private; expose a flag so clients know distance is computable
  const { locationLat, locationLng, ...publicProfile } = profile;
  const rating =
    profile.ratingCount > 0
      ? Math.round((profile.ratingSum / profile.ratingCount) * 10) / 10
      : null;
  return res.json({ ...publicProfile, hasLocation: locationLat != null, rating });
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
router.get("/:userId/reviews", async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const items = await db.query.tradeReviewsTable.findMany({
    where: eq(tradeReviewsTable.revieweeId, p(req.params["userId"])),
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

export default router;
