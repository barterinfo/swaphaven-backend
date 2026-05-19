import { Router } from "express";
import { eq } from "drizzle-orm";
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
const updateProfileSchema = z.object({
  displayName:  z.string().min(1).max(80).optional(),
  bio:          z.string().max(500).optional(),
  avatarUrl:    z.string().url().optional(),
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

  // Hide private fields from public profile
  const { locationLat, locationLng, ...publicProfile } = profile;
  return res.json({ ...publicProfile, hasLocation: locationLat != null });
});

// ─── GET /api/users/:userId/listings ─────────────────────────────────────────
router.get("/:userId/listings", async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const items = await db.query.listingsTable.findMany({
    where: eq(listingsTable.userId, p(req.params["userId"])),
    with: { images: true, category: true },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
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
