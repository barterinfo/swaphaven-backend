import { Router } from "express";
import { and, eq, ilike, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  listingsTable, listingImagesTable, listingWantsTable, categoriesTable,
  userProfilesTable, offersTable, notificationsTable,
} from "../db/schema/index.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p, toDecimalStr } from "../lib/route-helpers.js";
import { filterListingImageUrls } from "../lib/media.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import {
  buildReviewSnapshot,
  createListingBodySchema,
  isUuid,
  normalizeDetails,
  resolveCategorySlug,
  resolveCategoryUuid,
  resolveEstimatedValue,
  resolveLocation,
  serializeListingBarter,
  type SellerSnapshot,
} from "../lib/barter-listing.js";

const router = Router();

// ─── GET /api/categories ──────────────────────────────────────────────────────
export async function listCategories(_req: unknown, res: { json: (v: unknown) => void }): Promise<void> {
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  res.json(cats);
}

async function loadListingImages(listingId: string): Promise<string[]> {
  const rows = await db.query.listingImagesTable.findMany({
    where: eq(listingImagesTable.listingId, listingId),
    orderBy: (t, { asc }) => [asc(t.position)],
  });
  return rows.map((r) => r.url);
}

type OfferCancelReason = "listing_deleted" | "listing_sold";

async function cancelPendingOffersAndNotify(
  listingId: string,
  listingTitle: string,
  reason: OfferCancelReason,
): Promise<void> {
  const pending = await db.query.offersTable.findMany({
    where: and(eq(offersTable.listingId, listingId), eq(offersTable.status, "pending")),
    columns: { id: true, buyerId: true },
  });
  if (!pending.length) return;

  await db
    .update(offersTable)
    .set({ status: "denied", updatedAt: new Date() })
    .where(inArray(offersTable.id, pending.map((o) => o.id)));

  const body =
    reason === "listing_deleted"
      ? `"${listingTitle}" has been removed. Your offer has been declined.`
      : `"${listingTitle}" has been marked as sold. Your offer has been declined.`;

  await db.insert(notificationsTable).values(
    pending.map((o) => ({
      userId:         o.buyerId,
      type:           "offer_denied" as const,
      title:          "Offer declined",
      body,
      relatedOfferId: o.id,
    })),
  );
}

// ─── GET /api/listings ────────────────────────────────────────────────────────
router.get("/", optionalAuth, async (req, res) => {
  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { q, categoryId, category, excludeMine, status } = req.query as Record<string, string | undefined>;

  const listingStatus = status === "traded" ? "traded" : "active";
  const conditions: SQL<unknown>[] = [eq(listingsTable.status, listingStatus)];
  if (q) conditions.push(ilike(listingsTable.title, `%${q}%`));
  if (categoryId && isUuid(categoryId)) {
    conditions.push(eq(listingsTable.categoryId, categoryId));
  } else if (categoryId || category) {
    conditions.push(eq(listingsTable.category, categoryId ?? category ?? ""));
  }
  if (cursor) conditions.push(lt(listingsTable.createdAt, new Date(cursor)));
  if (excludeMine !== "false" && req.user) {
    conditions.push(ne(listingsTable.userId, req.user.sub));
  }
  if (req.user) {
    const hidden = await getActiveNegotiationListingIds(req.user.sub);
    if (hidden.length) conditions.push(notInArray(listingsTable.id, hidden));
  }

  const rawItems = await db.query.listingsTable.findMany({
    where: and(...conditions),
    with: { images: true, categoryRow: true },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const listings = await Promise.all(
    rawItems.map(async (row) =>
      serializeListingBarter(row, {
        images: row.images?.length
          ? row.images.sort((a, b) => a.position - b.position).map((i) => i.url)
          : await loadListingImages(row.id),
      }),
    ),
  );

  const nextCursor = rawItems.length === limit ? encodeCursor(rawItems.at(-1)!.createdAt) : null;
  return res.json({ listings, items: rawItems, nextCursor });
});

// ─── POST /api/listings ───────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const parsed = createListingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues.map((i) => i.message).join("; ") || "Invalid listing body",
    });
  }

  const data = parsed.data;
  const category = resolveCategorySlug(data);
  const categoryUuid = resolveCategoryUuid(data);
  const estimatedValue = resolveEstimatedValue(data);
  const details = normalizeDetails(data.details);
  const location = resolveLocation(data);
  const reviewSnapshot = buildReviewSnapshot(
    data,
    category,
    estimatedValue,
    details,
    location,
  );

  const [listing] = await db
    .insert(listingsTable)
    .values({
      userId: req.user!.sub,
      title: data.title.trim(),
      description: data.description ?? "",
      category,
      categoryId: categoryUuid,
      condition: data.condition,
      estimatedValue,
      estimatedValueCents:
        data.estimatedValueCents ??
        (estimatedValue > 0 ? estimatedValue * 100 : null),
      acceptCashTopUps: Boolean(data.acceptCashTopUps),
      wantedCategoryIds: data.wantedCategoryIds ?? [],
      wantedCategories: data.wantedCategories ?? [],
      details,
      reviewSnapshot,
      isSwipeOnly: Boolean(data.isSwipeOnly),
      locationCity: location.city,
      locationLat: toDecimalStr(location.lat),
      locationLng: toDecimalStr(location.lng),
      locationAddress: location.address,
      locationState: location.state,
      locationCountry: location.country,
      locationPostalCode: location.postalCode,
    })
    .returning();

  const imageUrls = filterListingImageUrls(data.images ?? []);
  if (imageUrls.length) {
    await db.insert(listingImagesTable).values(
      imageUrls.map((url, position) => ({
        listingId: listing.id,
        url,
        position,
      })),
    );
  }

  const wantRows: { listingId: string; categoryId?: string | null; freeText?: string | null }[] = [];
  for (const cid of data.wantedCategoryIds ?? []) {
    if (isUuid(cid)) wantRows.push({ listingId: listing.id, categoryId: cid });
  }
  if (data.wantedFreeText?.trim()) {
    wantRows.push({ listingId: listing.id, freeText: data.wantedFreeText.trim() });
  }
  if (wantRows.length) await db.insert(listingWantsTable).values(wantRows);

  const serialized = serializeListingBarter(listing, { images: imageUrls });
  return res.status(201).json({
    listing: serialized,
    // Legacy flat fields (tests + older clients)
    id: listing.id,
    title: listing.title,
    status: listing.status,
    userId: listing.userId,
  });
});

// ─── GET /api/listings/trending ───────────────────────────────────────────────
// Returns trending items (highest right-swipe counts) first, followed by recent
// active items. Excludes the authenticated user's own listings when signed in.
//
// Optional query params: lat, lng, radius (miles).
// When supplied, only listings within the radius are returned; listings with no
// coordinates are always included as a geographic fallback.
router.get("/trending", optionalAuth, async (req, res) => {
  const userId = req.user?.sub;
  const trendingLimit = 20;
  const othersLimit = 40;

  const rawLat = parseFloat(req.query["lat"] as string);
  const rawLng = parseFloat(req.query["lng"] as string);
  const rawRadius = parseFloat(req.query["radius"] as string);
  const hasLocation =
    !isNaN(rawLat) && !isNaN(rawLng) && !isNaN(rawRadius) && rawRadius > 0;

  const baseConditions: SQL<unknown>[] = [eq(listingsTable.status, "active")];
  if (userId) {
    baseConditions.push(ne(listingsTable.userId, userId));
    const hidden = await getActiveNegotiationListingIds(userId);
    if (hidden.length) baseConditions.push(notInArray(listingsTable.id, hidden));
  }

  // Haversine distance in miles. Listings without coordinates are included as a
  // fallback so the feed is never unexpectedly empty.
  if (hasLocation) {
    baseConditions.push(
      sql`(
        ${listingsTable.locationLat} IS NULL
        OR ${listingsTable.locationLng} IS NULL
        OR (
          2 * 3958.8 * asin(
            sqrt(
              power(sin((radians(${rawLat}) - radians(${listingsTable.locationLat}::float)) / 2), 2)
              + cos(radians(${listingsTable.locationLat}::float))
              * cos(radians(${rawLat}))
              * power(sin((radians(${rawLng}) - radians(${listingsTable.locationLng}::float)) / 2), 2)
            )
          ) <= ${rawRadius}
        )
      )`,
    );
  }

  // Top items by right-swipe count (most-liked / most-offered-on signal).
  const trendingRaw = await db.query.listingsTable.findMany({
    where: and(...baseConditions),
    with: { images: true, categoryRow: true },
    limit: trendingLimit,
    orderBy: (t, { desc }) => [desc(t.rightSwipeCount), desc(t.createdAt)],
  });

  const trendingIds = trendingRaw.map((r) => r.id);

  // Recent listings, excluding already-fetched trending items.
  const othersConditions: SQL<unknown>[] = [...baseConditions];
  if (trendingIds.length > 0) {
    othersConditions.push(notInArray(listingsTable.id, trendingIds));
  }

  const othersRaw = await db.query.listingsTable.findMany({
    where: and(...othersConditions),
    with: { images: true, categoryRow: true },
    limit: othersLimit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const serialize = (rows: typeof trendingRaw) =>
    Promise.all(
      rows.map(async (row) =>
        serializeListingBarter(row, {
          images: row.images?.length
            ? row.images.sort((a, b) => a.position - b.position).map((i) => i.url)
            : await loadListingImages(row.id),
        }),
      ),
    );

  const [trending, others] = await Promise.all([
    serialize(trendingRaw),
    serialize(othersRaw),
  ]);

  return res.json({ trending, others });
});

// ─── GET /api/listings/:listingId ─────────────────────────────────────────────
router.get("/:listingId", async (req, res) => {
  console.log("GET /api/listings/:listingId", req.params["listingId"]);
  const listingId = p(req.params["listingId"]);
  // No `user` join — email must never be exposed on a public endpoint.
  const listing = await db.query.listingsTable.findFirst({
    where: and(eq(listingsTable.id, listingId), ne(listingsTable.status, "deleted")),
    with: { images: true, categoryRow: true, wants: true },
  });
  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  const images = listing.images?.length
    ? listing.images.sort((a, b) => a.position - b.position).map((i) => i.url)
    : await loadListingImages(listing.id);

  const sellerProfile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, listing.userId),
  });

  let seller: SellerSnapshot | null = null;
  if (sellerProfile) {
    const rating =
      sellerProfile.ratingCount > 0
        ? Math.round((sellerProfile.ratingSum / sellerProfile.ratingCount) * 10) / 10
        : null;
    seller = {
      id: sellerProfile.id,
      display_name: sellerProfile.displayName,
      avatar_url: sellerProfile.avatarUrl ?? null,
      is_verified: sellerProfile.isVerified,
      is_phone_verified: sellerProfile.isPhoneVerified,
      total_trades: sellerProfile.totalTrades,
      rating,
      location_city: sellerProfile.locationCity ?? null,
      completion_rate: sellerProfile.completionRate ?? null,
      avg_response_minutes: sellerProfile.avgResponseMinutes ?? null,
      member_since: sellerProfile.createdAt,
    };
  }

  const ownerName = sellerProfile?.displayName ?? "";
  const payload = serializeListingBarter(listing, { ownerName, images, seller });
  return res.json({
    listing: payload,
    id: listing.id,
    title: listing.title,
    status: listing.status,
    images,
  });
});

// ─── POST /api/listings/:listingId/view ───────────────────────────────────────
// Requires auth to prevent anonymous view-count inflation. Responds immediately
// with 204; the DB write is fire-and-forget so the client is never blocked.
router.post("/:listingId/view", requireAuth, (req, res) => {
  const listingId = p(req.params["listingId"]);
  // Respond before the write so mobile scrolling is never delayed.
  res.status(204).send();
  db.update(listingsTable)
    .set({ viewCount: sql`${listingsTable.viewCount} + 1` })
    .where(and(eq(listingsTable.id, listingId), ne(listingsTable.status, "deleted")))
    .catch(console.error);
});

// ─── PATCH /api/listings/:listingId ───────────────────────────────────────────
// Edit Listing screen — title, value, condition, category, description, trade wants.
// Status changes use POST /sold or DELETE; location is set at create time only.
const updateListingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).optional(),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  condition: z.enum(["new", "like_new", "great", "good", "fair"]).optional(),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  estimatedValueCents: z.number().int().positive().optional(),
  wantedCategoryIds: z.array(z.string()).optional(),
  wantedCategories: z.array(z.string()).optional(),
});

async function syncListingWants(
  listingId: string,
  wantedCategoryIds: string[],
): Promise<void> {
  await db.delete(listingWantsTable).where(eq(listingWantsTable.listingId, listingId));
  const wantRows: { listingId: string; categoryId?: string | null }[] = [];
  for (const cid of wantedCategoryIds) {
    if (isUuid(cid)) wantRows.push({ listingId, categoryId: cid });
  }
  if (wantRows.length) await db.insert(listingWantsTable).values(wantRows);
}

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

  const patch = parsed.data;
  const wantsChanged =
    patch.wantedCategoryIds !== undefined || patch.wantedCategories !== undefined;
  const nextWantedIds = patch.wantedCategoryIds ?? listing.wantedCategoryIds ?? [];

  const [updated] = await db
    .update(listingsTable)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.categoryId !== undefined && isUuid(patch.categoryId)
        ? { categoryId: patch.categoryId }
        : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
      ...(patch.estimatedValue !== undefined
        ? { estimatedValue: Math.round(patch.estimatedValue) }
        : {}),
      ...(patch.estimatedValueCents !== undefined
        ? { estimatedValueCents: patch.estimatedValueCents }
        : {}),
      ...(patch.wantedCategoryIds !== undefined
        ? { wantedCategoryIds: patch.wantedCategoryIds }
        : {}),
      ...(patch.wantedCategories !== undefined
        ? { wantedCategories: patch.wantedCategories }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId))
    .returning();

  if (wantsChanged) await syncListingWants(listingId, nextWantedIds);

  const images = await loadListingImages(updated.id);
  const serialized = serializeListingBarter(updated, { images });
  return res.json({
    listing: serialized,
    id: updated.id,
    title: updated.title,
    status: updated.status,
  });
});

// ─── DELETE /api/listings/:listingId ─────────────────────────────────────────
router.delete("/:listingId", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (listing.status === "deleted") return res.status(409).json({ error: "conflict", message: "Listing already deleted" });

  await db.update(listingsTable)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(listingsTable.id, listingId));

  await cancelPendingOffersAndNotify(listingId, listing.title, "listing_deleted");

  return res.status(204).send();
});

// ─── POST /api/listings/:listingId/sold ───────────────────────────────────────
const markSoldSchema = z.object({
  soldMethod:        z.enum(["traded_on_barter", "sold_for_cash", "given_away"]),
  tradedWithUserId:  z.string().uuid().optional(),
  shareWin:          z.boolean().default(false),
});

router.post("/:listingId/sold", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({ where: eq(listingsTable.id, listingId) });
  if (!listing) return res.status(404).json({ error: "not_found", message: "Listing not found" });
  if (listing.userId !== req.user!.sub) return res.status(403).json({ error: "forbidden" });
  if (listing.status === "deleted") return res.status(409).json({ error: "conflict", message: "Listing has been deleted" });
  if (listing.status === "traded") return res.status(409).json({ error: "conflict", message: "Listing already marked as sold" });

  const parsed = markSoldSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const { soldMethod, tradedWithUserId, shareWin } = parsed.data;

  const [updated] = await db
    .update(listingsTable)
    .set({
      status:           "traded",
      soldMethod,
      tradedWithUserId: tradedWithUserId ?? null,
      updatedAt:        new Date(),
    })
    .where(eq(listingsTable.id, listingId))
    .returning();

  await cancelPendingOffersAndNotify(listingId, listing.title, "listing_sold");

  if (soldMethod === "traded_on_barter") {
    const profile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, req.user!.sub),
      columns: { totalTrades: true },
    });
    if (profile) {
      await db
        .update(userProfilesTable)
        .set({ totalTrades: profile.totalTrades + 1, updatedAt: new Date() })
        .where(eq(userProfilesTable.id, req.user!.sub));
    }
  }

  const images = await loadListingImages(updated.id);
  const serialized = serializeListingBarter(updated, { images });
  return res.json({
    listing:  serialized,
    id:       updated.id,
    status:   updated.status,
    soldMethod,
    shareWin,
  });
});

// ─── POST /api/listings/:listingId/images ─────────────────────────────────────
const addImageSchema = z.object({
  url: z.string().min(1),
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

  const [url] = filterListingImageUrls([parsed.data.url]);
  if (!url) {
    return res.status(400).json({
      error: "validation",
      message: "url must be a public https URL (upload via POST /api/media/presign first)",
    });
  }

  const [image] = await db
    .insert(listingImagesTable)
    .values({ listingId, url, position: parsed.data.position })
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
