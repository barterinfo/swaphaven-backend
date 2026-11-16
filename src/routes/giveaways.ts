import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  listingsTable,
  listingWantsTable,
  categoriesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { p, toDecimalStr } from "../lib/route-helpers.js";
import { findProfaneField } from "../lib/moderation.js";
import { insertListingFromBody } from "../lib/create-listing.js";
import {
  acceptGiveawayInterest,
  createGiveawayFromPlaceBodySchema,
  createGiveawayInterest,
  createGiveawayInterestSchema,
  declineGiveawayInterest,
  serializeGiveawayListing,
  updateGiveawaySchema,
} from "../lib/giveaway.js";
import {
  normalizeGiveawayFields,
  resolveLocation,
  type CreateListingBody,
} from "../lib/barter-listing.js";
import {
  normalizeCountryCode,
  resolveRequestCountry,
} from "../lib/geo-country.js";
import { queryHasUnit } from "../lib/place-suggestions.js";
import { scheduleListingEmbed } from "../lib/barter-ai.js";

const router = Router();

// ─── POST /api/giveaways ──────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const parsed = createGiveawayFromPlaceBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error:
        parsed.error.issues.map((i) => i.message).join("; ") ||
        "Invalid giveaway body",
    });
  }

  const { place, ...rest } = parsed.data;
  if (queryHasUnit(place.label)) {
    return res.status(400).json({
      error: "validation",
      message: "Pick a public place or neighbourhood. Unit numbers are not accepted.",
    });
  }

  const data: CreateListingBody = normalizeGiveawayFields({
    ...rest,
    isGiveaway: true,
    acceptCashTopUps: false,
    estimatedValueCents: 0,
    wantedCategoryIds: [],
    wantedCategories: [],
    location: {
      lat: place.lat,
      lng: place.lng,
      city: place.label,
      country: place.countryCode?.toUpperCase() ?? "",
      address: "",
      state: "",
      postalCode: "",
    },
  });

  const profaneField = findProfaneField([
    { field: "title", value: data.title },
    { field: "description", value: data.description },
    { field: "brand", value: data.details?.brand },
    { field: "ageRange", value: data.details?.ageRange },
  ]);
  if (profaneField) {
    return res.status(400).json({
      error: "moderation",
      message: `${profaneField} contains inappropriate language and cannot be used.`,
    });
  }

  const location = resolveLocation(data);
  if (location.lat == null || location.lng == null || !location.city.trim()) {
    return res.status(400).json({
      error: "validation",
      message: "A tapped place with coordinates is required.",
    });
  }

  const result = await insertListingFromBody(req.user!.sub, data, {
    location,
    pinKind: place.pinKind,
    requestCountry: resolveRequestCountry(req).country,
  });
  if ("error" in result && result.error) {
    return res.status(result.error.status).json(result.error.body);
  }
  return res.status(201).json(result.body);
});

// Static /interests paths before /:listingId so "interests" is not captured.
router.post("/interests/:interestId/accept", requireAuth, async (req, res) => {
  const result = await acceptGiveawayInterest({
    offerId: p(req.params["interestId"]),
    userId: req.user!.sub,
  });
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(200).json(result.body);
});

router.post("/interests/:interestId/decline", requireAuth, async (req, res) => {
  const result = await declineGiveawayInterest({
    offerId: p(req.params["interestId"]),
    userId: req.user!.sub,
  });
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(204).send();
});

// ─── PATCH /api/giveaways/:listingId ──────────────────────────────────────────
router.patch("/:listingId", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
  });
  if (!listing) {
    return res.status(404).json({ error: "not_found", message: "Listing not found" });
  }
  if (listing.userId !== req.user!.sub) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!listing.isGiveaway) {
    return res.status(409).json({
      error: "conflict",
      message: "Use PATCH /api/listings/:id for barter listings",
    });
  }

  const parsed = updateGiveawaySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }
  const patch = parsed.data;
  const profaneField = findProfaneField([
    { field: "title", value: patch.title },
    { field: "description", value: patch.description },
  ]);
  if (profaneField) {
    return res.status(400).json({
      error: "moderation",
      message: `${profaneField} contains inappropriate language and cannot be used.`,
    });
  }

  let nextCategory = patch.category;
  let nextCategoryId = patch.categoryId;
  if (patch.categoryId !== undefined) {
    const catRow = await db.query.categoriesTable.findFirst({
      where: eq(categoriesTable.id, patch.categoryId),
      columns: { id: true, name: true },
    });
    if (!catRow) {
      return res.status(400).json({ error: "Unknown categoryId" });
    }
    nextCategoryId = catRow.id;
    nextCategory = patch.category?.trim() || catRow.name;
  }

  let nextStatus: "active" | "paused" | undefined;
  if (patch.status !== undefined && patch.status !== listing.status) {
    const allowed =
      (listing.status === "active" && patch.status === "paused") ||
      (listing.status === "paused" && patch.status === "active");
    if (!allowed) {
      return res.status(409).json({
        error: "conflict",
        message: `Cannot change status from ${listing.status} to ${patch.status}`,
      });
    }
    nextStatus = patch.status;
  }

  let placePatch:
    | {
        locationCity: string;
        locationLat: string;
        locationLng: string;
        locationAddress: string;
        locationState: string;
        locationPostalCode: string;
        locationCountry: string;
        locationPinKind: "area" | "venue";
      }
    | undefined;
  if (patch.place !== undefined) {
    if (queryHasUnit(patch.place.label)) {
      return res.status(400).json({
        error: "validation",
        message: "Pick a public place or neighbourhood. Unit numbers are not accepted.",
      });
    }
    const country =
      normalizeCountryCode(patch.place.countryCode) ??
      normalizeCountryCode(listing.locationCountry) ??
      "";
    placePatch = {
      locationCity: patch.place.label.trim(),
      locationLat: toDecimalStr(patch.place.lat) ?? String(patch.place.lat),
      locationLng: toDecimalStr(patch.place.lng) ?? String(patch.place.lng),
      locationAddress: "",
      locationState: "",
      locationPostalCode: "",
      locationCountry: country,
      locationPinKind: patch.place.pinKind,
    };
  }

  const [updated] = await db
    .update(listingsTable)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(nextCategory !== undefined ? { category: nextCategory } : {}),
      ...(nextCategoryId !== undefined ? { categoryId: nextCategoryId } : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
      estimatedValueCents: 0,
      acceptCashTopUps: false,
      wantedCategoryIds: [],
      wantedCategories: [],
      isGiveaway: true,
      ...(nextStatus !== undefined ? { status: nextStatus } : {}),
      ...(placePatch ?? {}),
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId))
    .returning();

  await db.delete(listingWantsTable).where(eq(listingWantsTable.listingId, listingId));
  scheduleListingEmbed(updated.id);

  const serialized = await serializeGiveawayListing(updated.id);
  return res.json({ listing: serialized });
});

// ─── POST /api/giveaways/:listingId/interest ──────────────────────────────────
router.post("/:listingId/interest", requireAuth, async (req, res) => {
  const listingId = p(req.params["listingId"]);
  const parsed = createGiveawayInterestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await createGiveawayInterest({
    listingId,
    buyerId: req.user!.sub,
    swipeId: parsed.data.swipeId,
    buyerNote: parsed.data.buyerNote,
  });
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(201).json(result.body);
});

export default router;
