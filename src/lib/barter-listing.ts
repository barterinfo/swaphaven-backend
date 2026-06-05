import { z } from "zod";
import type { Listing, ListingDetails } from "../db/schema/listings.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

const locationSchema = z
  .object({
    lat: z.union([z.number(), z.string()]).optional().nullable(),
    lng: z.union([z.number(), z.string()]).optional().nullable(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    postal_code: z.string().optional(),
  })
  .optional();

/** Matches barter-stack `POST /api/listings` + Flutter `createProduct` body. */
export const createListingBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).optional().default(""),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  condition: z
    .enum(["new", "like_new", "great", "good", "fair"])
    .default("good"),
  estimatedValue: z.coerce.number().nonnegative().optional(),
  estimatedValueCents: z.coerce.number().int().nonnegative().optional(),
  acceptCashTopUps: z.boolean().optional().default(false),
  isSwipeOnly: z.boolean().optional().default(false),
  wantedCategoryIds: z.array(z.string()).optional().default([]),
  wantedCategories: z.array(z.string()).optional().default([]),
  wantedFreeText: z.string().max(500).optional(),
  details: z
    .object({
      ageRange: z.string().optional(),
      brand: z.string().optional(),
    })
    .optional(),
  location: locationSchema,
  images: z.array(z.string()).optional().default([]),
  // Legacy SwapHaven-only fields (still accepted)
  locationCity: z.string().max(100).optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
});

export type CreateListingBody = z.infer<typeof createListingBodySchema>;

/** Input shape for seed/fixture scripts that build a create-listing request body. */
export type ListingFixtureInput = {
  title: string;
  description: string;
  category: string;
  categoryId: string;
  condition: CreateListingBody["condition"];
  estimatedValue: number;
  acceptCashTopUps: boolean;
  isSwipeOnly: boolean;
  wantedCategoryIds: string[];
  wantedCategories: string[];
  wantedFreeText: string;
  details: { ageRange: string; brand: string };
  location: {
    lat: number;
    lng: number;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  imageSeed: string;
};

export function buildListingPayload(
  fixture: ListingFixtureInput,
): CreateListingBody {
  return {
    title: fixture.title,
    description: fixture.description,
    category: fixture.category,
    categoryId: fixture.categoryId,
    condition: fixture.condition,
    estimatedValue: fixture.estimatedValue,
    estimatedValueCents: fixture.estimatedValue * 100,
    acceptCashTopUps: fixture.acceptCashTopUps,
    isSwipeOnly: fixture.isSwipeOnly,
    wantedCategoryIds: fixture.wantedCategoryIds,
    wantedCategories: fixture.wantedCategories,
    wantedFreeText: fixture.wantedFreeText,
    details: fixture.details,
    location: fixture.location,
    images: [`https://picsum.photos/seed/${fixture.imageSeed}/800/600`],
  };
}

export function resolveCategorySlug(data: CreateListingBody): string {
  if (data.category?.trim()) return data.category.trim();
  if (data.categoryId?.trim() && !isUuid(data.categoryId)) {
    return data.categoryId.trim();
  }
  return "general";
}

export function resolveCategoryUuid(data: CreateListingBody): string | null {
  if (data.categoryId?.trim() && isUuid(data.categoryId)) {
    return data.categoryId.trim();
  }
  return null;
}

export function resolveEstimatedValue(data: CreateListingBody): number {
  if (data.estimatedValue != null && Number.isFinite(data.estimatedValue)) {
    return Math.round(data.estimatedValue);
  }
  if (
    data.estimatedValueCents != null &&
    Number.isFinite(data.estimatedValueCents)
  ) {
    return Math.round(data.estimatedValueCents / 100);
  }
  return 0;
}

function parseCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveLocation(data: CreateListingBody) {
  const loc = data.location ?? {};
  const lat = parseCoord(loc.lat) ?? data.locationLat ?? null;
  const lng = parseCoord(loc.lng) ?? data.locationLng ?? null;
  return {
    lat,
    lng,
    address: loc.address?.trim() ?? "",
    city: loc.city?.trim() ?? data.locationCity?.trim() ?? "",
    state: loc.state?.trim() ?? "",
    country: loc.country?.trim() ?? "",
    postalCode: (loc.postalCode ?? loc.postal_code ?? "").trim(),
  };
}

export function normalizeDetails(
  details: CreateListingBody["details"],
): ListingDetails {
  return {
    ageRange: details?.ageRange?.trim() ?? "",
    brand: details?.brand?.trim() ?? "",
  };
}

export function buildReviewSnapshot(
  data: CreateListingBody,
  category: string,
  estimatedValue: number,
  details: ListingDetails,
  location: ReturnType<typeof resolveLocation>,
) {
  return {
    title: data.title.trim(),
    description: data.description ?? "",
    category,
    condition: data.condition,
    estimatedValue,
    acceptCashTopUps: Boolean(data.acceptCashTopUps),
    wantedCategoryIds: data.wantedCategoryIds ?? [],
    wantedCategories: data.wantedCategories ?? [],
    details,
    location: {
      lat: location.lat,
      lng: location.lng,
      address: location.address,
      city: location.city,
      state: location.state,
      country: location.country,
      postalCode: location.postalCode,
    },
  };
}

/** barter-stack `serializeListing` wire shape (snake_case). */
export function serializeListingBarter(
  listing: Listing,
  options: { ownerName?: string; images?: string[]; rightSwipeCount?: number } = {},
) {
  const lat =
    listing.locationLat != null ? Number(listing.locationLat) : null;
  const lng =
    listing.locationLng != null ? Number(listing.locationLng) : null;
  const wantedIds = listing.wantedCategoryIds ?? [];
  const wantedLabels = listing.wantedCategories ?? [];
  const details = listing.details ?? { ageRange: "", brand: "" };

  return {
    id: listing.id,
    user_id: listing.userId,
    title: listing.title,
    description: listing.description ?? "",
    category: listing.category,
    condition: listing.condition,
    estimated_value: listing.estimatedValue ?? 0,
    accept_cash_top_ups: listing.acceptCashTopUps,
    wanted_category_ids: wantedIds,
    wanted_categories: wantedLabels,
    images: options.images ?? [],
    details,
    location: {
      address: listing.locationAddress ?? "",
      city: listing.locationCity ?? "",
      state: listing.locationState ?? "",
      country: listing.locationCountry ?? "",
      postal_code: listing.locationPostalCode ?? "",
      lat,
      lng,
    },
    review_snapshot: listing.reviewSnapshot ?? {},
    status: listing.status,
    created_at: listing.createdAt,
    owner_name: options.ownerName ?? "",
    right_swipe_count: options.rightSwipeCount ?? 0,
  };
}
