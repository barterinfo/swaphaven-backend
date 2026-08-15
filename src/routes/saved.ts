import { Router } from "express";
import { and, desc, eq, inArray, lt, ne, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  savedListingsTable,
  listingsTable,
  listingImagesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p } from "../lib/route-helpers.js";
import { serializeListingBarter } from "../lib/barter-listing.js";
import { blockedUserIds } from "../lib/user-blocks.js";

const router = Router();

// ─── GET /api/saved ───────────────────────────────────────────────────────────
/** List the caller's saved listings (active only), newest first. */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);

  const conditions = [
    eq(savedListingsTable.userId, userId),
    eq(listingsTable.status, "active"),
  ];
  const blocked = await blockedUserIds(userId);
  if (blocked.length) {
    conditions.push(notInArray(listingsTable.userId, blocked));
  }
  if (cursor) {
    conditions.push(lt(savedListingsTable.createdAt, cursor));
  }

  const rows = await db
    .select({
      savedId: savedListingsTable.id,
      savedAt: savedListingsTable.createdAt,
      listing: listingsTable,
    })
    .from(savedListingsTable)
    .innerJoin(listingsTable, eq(listingsTable.id, savedListingsTable.listingId))
    .where(and(...conditions))
    .orderBy(desc(savedListingsTable.createdAt))
    .limit(limit);

  const listingIds = rows.map((r) => r.listing.id);
  const imageRows = listingIds.length
    ? await db
        .select({
          listingId: listingImagesTable.listingId,
          url: listingImagesTable.url,
          position: listingImagesTable.position,
        })
        .from(listingImagesTable)
        .where(inArray(listingImagesTable.listingId, listingIds))
        .orderBy(listingImagesTable.position)
    : [];

  const imagesByListing = new Map<string, string[]>();
  for (const img of imageRows) {
    const list = imagesByListing.get(img.listingId) ?? [];
    list.push(img.url);
    imagesByListing.set(img.listingId, list);
  }

  const items = rows.map((row) => ({
    saved_id: row.savedId,
    saved_at: row.savedAt,
    listing: {
      ...serializeListingBarter(row.listing, {
        images: imagesByListing.get(row.listing.id) ?? [],
      }),
      is_saved: true,
    },
  }));

  const nextCursor =
    rows.length === limit ? encodeCursor(rows.at(-1)!.savedAt) : null;

  return res.json({ items, nextCursor });
});

// ─── POST /api/saved/:listingId ───────────────────────────────────────────────
/** Save a listing for later. Idempotent. Cannot save own listings. */
router.post("/:listingId", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const listingId = p(req.params["listingId"]);

  const listing = await db.query.listingsTable.findFirst({
    where: and(eq(listingsTable.id, listingId), ne(listingsTable.status, "deleted")),
  });
  if (!listing) {
    return res.status(404).json({ error: "not_found", message: "Listing not found" });
  }
  if (listing.userId === userId) {
    return res.status(400).json({
      error: "bad_request",
      message: "Cannot save your own listing",
    });
  }
  if (listing.status !== "active") {
    return res.status(400).json({
      error: "bad_request",
      message: "Only active listings can be saved",
    });
  }

  const existing = await db.query.savedListingsTable.findFirst({
    where: and(
      eq(savedListingsTable.userId, userId),
      eq(savedListingsTable.listingId, listingId),
    ),
  });
  if (existing) {
    return res.status(200).json({
      id: existing.id,
      listingId,
      saved: true,
    });
  }

  const [row] = await db
    .insert(savedListingsTable)
    .values({ userId, listingId })
    .returning();

  return res.status(201).json({
    id: row!.id,
    listingId,
    saved: true,
  });
});

// ─── DELETE /api/saved/:listingId ─────────────────────────────────────────────
/** Remove a save. Idempotent — 204 even if nothing was saved. */
router.delete("/:listingId", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const listingId = p(req.params["listingId"]);

  await db
    .delete(savedListingsTable)
    .where(
      and(
        eq(savedListingsTable.userId, userId),
        eq(savedListingsTable.listingId, listingId),
      ),
    );

  return res.status(204).send();
});

export default router;
