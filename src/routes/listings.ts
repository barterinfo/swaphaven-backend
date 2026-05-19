import { Router } from "express";
import { and, eq, ilike, lt, ne } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  listingsTable, listingImagesTable, listingWantsTable, categoriesTable,
} from "../db/schema/index.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p, toDecimalStr } from "../lib/route-helpers.js";

const router = Router();

// ─── GET /api/categories ──────────────────────────────────────────────────────
export async function listCategories(_req: unknown, res: { json: (v: unknown) => void }): Promise<void> {
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(cats);
}

// ─── GET /api/listings ────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { q, categoryId, excludeMine } = req.query as Record<string, string | undefined>;

  const conditions: SQL<unknown>[] = [eq(listingsTable.status, "active")];
  if (q) conditions.push(ilike(listingsTable.title, `%${q}%`));
  if (categoryId) conditions.push(eq(listingsTable.categoryId, categoryId));
  if (cursor) conditions.push(lt(listingsTable.createdAt, cursor));
  if (excludeMine !== "false" && req.user) {
    conditions.push(ne(listingsTable.userId, req.user.sub));
  }

  const items = await db.query.listingsTable.findMany({
    where: and(...conditions),
    with: { images: true, category: true },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

// ─── POST /api/listings ───────────────────────────────────────────────────────
const createListingSchema = z.object({
  title:               z.string().min(1).max(120),
  description:         z.string().max(2000).optional(),
  categoryId:          z.string().uuid().optional(),
  condition:           z.enum(["new", "like_new", "great", "good", "fair"]),
  estimatedValueCents: z.number().int().positive().optional(),
  isSwipeOnly:         z.boolean().default(false),
  locationCity:        z.string().max(100).optional(),
  locationLat:         z.number().min(-90).max(90).optional(),
  locationLng:         z.number().min(-180).max(180).optional(),
  wantedCategoryIds:   z.array(z.string().uuid()).optional(),
  wantedFreeText:      z.string().max(500).optional(),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { wantedCategoryIds, wantedFreeText, locationLat, locationLng, ...rest } = parsed.data;
  const [listing] = await db
    .insert(listingsTable)
    .values({
      ...rest,
      userId: req.user!.sub,
      locationLat: toDecimalStr(locationLat),
      locationLng: toDecimalStr(locationLng),
    })
    .returning();

  const wantRows: { listingId: string; categoryId?: string | null; freeText?: string | null }[] = [];
  for (const cid of wantedCategoryIds ?? []) wantRows.push({ listingId: listing.id, categoryId: cid });
  if (wantedFreeText) wantRows.push({ listingId: listing.id, freeText: wantedFreeText });
  if (wantRows.length) await db.insert(listingWantsTable).values(wantRows);

  return res.status(201).json(listing);
});

// ─── GET /api/listings/:listingId ─────────────────────────────────────────────
router.get("/:listingId", async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
    with: { images: true, category: true, wants: true },
  });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  return res.json(listing);
});

// ─── PATCH /api/listings/:listingId ───────────────────────────────────────────
const updateListingSchema = z.object({
  title:               z.string().min(1).max(120).optional(),
  description:         z.string().max(2000).optional(),
  categoryId:          z.string().uuid().optional(),
  condition:           z.enum(["new", "like_new", "great", "good", "fair"]).optional(),
  estimatedValueCents: z.number().int().positive().optional(),
  isSwipeOnly:         z.boolean().optional(),
  locationCity:        z.string().max(100).optional(),
  status:              z.enum(["active", "traded", "paused", "deleted"]).optional(),
});

router.patch("/:listingId", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
  });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const [updated] = await db
    .update(listingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(listingsTable.id, listingId))
    .returning();
  return res.json(updated);
});

// ─── DELETE /api/listings/:listingId ─────────────────────────────────────────
router.delete("/:listingId", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  await db.update(listingsTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(listingsTable.id, listingId));
  return res.status(204).send();
});

// ─── POST /api/listings/:listingId/images ─────────────────────────────────────
const addImageSchema = z.object({
  url:      z.string().url(),
  position: z.number().int().min(0).default(0),
});

router.post("/:listingId/images", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  const parsed = addImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const [image] = await db
    .insert(listingImagesTable)
    .values({ listingId, ...parsed.data })
    .returning();
  return res.status(201).json(image);
});

// ─── DELETE /api/listings/:listingId/images/:imageId ─────────────────────────
router.delete("/:listingId/images/:imageId", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const imageId   = p(req.params["imageId"]);
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });

  await db.delete(listingImagesTable).where(eq(listingImagesTable.id, imageId));
  return res.status(204).send();
});

export default router;
