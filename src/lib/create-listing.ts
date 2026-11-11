import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  listingsTable,
  listingImagesTable,
  listingWantsTable,
  categoriesTable,
  userProfilesTable,
} from "../db/schema/index.js";
import { filterListingImageUrls } from "./media.js";
import { findIrrelevantImage } from "./image-moderation.js";
import { toDecimalStr } from "./route-helpers.js";
import { scheduleListingEmbed } from "./barter-ai.js";
import { notifyFollowersOfNewListing } from "./follow-alerts.js";
import { normalizeCountryCode } from "./geo-country.js";
import {
  buildReviewSnapshot,
  isUuid,
  normalizeDetails,
  normalizeGiveawayFields,
  resolveCategoryUuid,
  resolveEstimatedValueCents,
  resolveLocation,
  serializeListingBarter,
  type CreateListingBody,
} from "./barter-listing.js";

/**
 * Shared insert path for POST /api/listings, /from-place, and /api/giveaways.
 * [pinKind] is set only on place-based routes.
 */
export async function insertListingFromBody(
  userId: string,
  data: CreateListingBody,
  opts: {
    location: ReturnType<typeof resolveLocation>;
    pinKind?: "area" | "venue" | null;
    /** Fallback country from CDN / request when payload and profile omit it. */
    requestCountry: string;
  },
) {
  const imageUrls = filterListingImageUrls(data.images ?? []);
  if (imageUrls.length) {
    const irrelevant = await findIrrelevantImage(
      imageUrls,
      data.title,
      data.description ?? "",
    );
    if (irrelevant) {
      return {
        error: {
          status: 400 as const,
          body: {
            error: "moderation",
            message:
              "One or more photos do not appear to match the listing title or description. Please upload a photo of the actual item.",
          },
        },
      };
    }
  }

  const categoryUuid = resolveCategoryUuid(data);
  const catRow = await db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.id, categoryUuid),
    columns: { id: true, name: true, slug: true },
  });
  if (!catRow) {
    return {
      error: {
        status: 400 as const,
        body: { error: "Unknown categoryId" },
      },
    };
  }

  const category = data.category?.trim() || catRow.name;
  const normalized = normalizeGiveawayFields(data);
  const estimatedValueCents = resolveEstimatedValueCents(normalized);
  const estimatedValueDollars = Math.floor(estimatedValueCents / 100);
  const details = normalizeDetails(normalized.details);
  const location = { ...opts.location };
  const isGiveaway = Boolean(normalized.isGiveaway);

  let country =
    normalizeCountryCode(location.country) ??
    normalizeCountryCode(
      (
        await db.query.userProfilesTable.findFirst({
          where: eq(userProfilesTable.id, userId),
          columns: { locationCountry: true },
        })
      )?.locationCountry,
    );
  if (!country) {
    country = opts.requestCountry;
  }
  location.country = country;

  const reviewSnapshot = buildReviewSnapshot(
    normalized,
    category,
    estimatedValueDollars,
    details,
    location,
  );

  const [listing] = await db
    .insert(listingsTable)
    .values({
      userId,
      title: normalized.title.trim(),
      description: normalized.description ?? "",
      category,
      categoryId: categoryUuid,
      condition: normalized.condition,
      estimatedValueCents,
      acceptCashTopUps: Boolean(normalized.acceptCashTopUps),
      isGiveaway,
      wantedCategoryIds: normalized.wantedCategoryIds ?? [],
      wantedCategories: normalized.wantedCategories ?? [],
      details,
      reviewSnapshot,
      isSwipeOnly: Boolean(normalized.isSwipeOnly),
      locationCity: location.city,
      locationLat: toDecimalStr(location.lat),
      locationLng: toDecimalStr(location.lng),
      locationAddress: location.address,
      locationState: location.state,
      locationCountry: location.country,
      locationPostalCode: location.postalCode,
      locationPinKind: opts.pinKind ?? null,
    })
    .returning();

  if (imageUrls.length) {
    await db.insert(listingImagesTable).values(
      imageUrls.map((url, position) => ({
        listingId: listing.id,
        url,
        position,
      })),
    );
  }

  const wantRows: {
    listingId: string;
    categoryId?: string | null;
    freeText?: string | null;
  }[] = [];
  for (const cid of normalized.wantedCategoryIds ?? []) {
    if (isUuid(cid)) wantRows.push({ listingId: listing.id, categoryId: cid });
  }
  if (normalized.wantedFreeText?.trim()) {
    wantRows.push({ listingId: listing.id, freeText: normalized.wantedFreeText.trim() });
  }
  if (wantRows.length) await db.insert(listingWantsTable).values(wantRows);

  const serialized = serializeListingBarter(listing, { images: imageUrls });
  scheduleListingEmbed(listing.id);
  void notifyFollowersOfNewListing({
    sellerId: listing.userId,
    listingId: listing.id,
    listingTitle: listing.title,
  }).catch(console.error);

  return {
    listing,
    serialized,
    body: {
      listing: serialized,
      id: listing.id,
      title: listing.title,
      status: listing.status,
      userId: listing.userId,
    },
  };
}
