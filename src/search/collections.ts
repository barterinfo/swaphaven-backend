import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingsTable, swipesTable, userProfilesTable } from "../db/schema/index.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import { recommendSearch } from "../lib/barter-ai.js";
import { serializeListingsByIds } from "../lib/related-listings.js";
import { hiddenOwnerIds } from "../lib/user-blocks.js";
import { followedOwnerIds } from "../lib/user-follows.js";
import { fetchSearchCandidateIds } from "./queries.js";
import type { SearchListingParams } from "./types.js";

const POOL_CAP = 200;
const FOLLOWED_SEARCH_SLOT = 40;

export type CollectionPage = {
  listings: Awaited<ReturnType<typeof serializeListingsByIds>>;
  total: number;
  nextOffset: number | null;
};

type CollectionFilters = Pick<
  SearchListingParams,
  "q" | "lat" | "lng" | "radius" | "conditions" | "category"
> & {
  viewerId: string;
  country: string;
  limit: number;
  offset: number;
  listingId?: string;
};

function emptyPage(): CollectionPage {
  return { listings: [], total: 0, nextOffset: null };
}

function slicePage<T>(items: T[], offset: number, limit: number): {
  page: T[];
  total: number;
  nextOffset: number | null;
} {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit < total ? offset + limit : null;
  return { page, total, nextOffset };
}

async function rankOrKeepOrder(opts: {
  viewerId: string;
  country: string;
  candidateIds: string[];
  excludeIds: string[];
  excludeOwnerIds: string[];
  followedOwnerIds?: string[];
  listingId?: string;
}): Promise<string[]> {
  if (!opts.candidateIds.length) return [];
  const ranked = await recommendSearch({
    userId: opts.viewerId,
    listingId: opts.listingId,
    candidateIds: opts.candidateIds,
    excludeIds: opts.excludeIds,
    excludeOwnerIds: opts.excludeOwnerIds,
    followedOwnerIds: opts.followedOwnerIds,
    country: opts.country,
    limit: Math.min(opts.candidateIds.length, POOL_CAP),
  });
  if (!ranked.skipped && ranked.items.length) {
    return ranked.items.map((i) => i.listingId);
  }
  return opts.candidateIds;
}

/** Merge recent followed-seller listings into the search candidate pool. */
async function injectFollowedListingIds(opts: {
  viewerId: string;
  followeeIds: string[];
  existingIds: string[];
}): Promise<string[]> {
  if (!opts.followeeIds.length) return opts.existingIds;

  const followedRows = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.status, "active"),
        inArray(listingsTable.userId, opts.followeeIds),
        ne(listingsTable.userId, opts.viewerId),
      ),
    )
    .orderBy(desc(listingsTable.createdAt))
    .limit(FOLLOWED_SEARCH_SLOT);

  const followedIds = followedRows.map((r) => r.id);
  if (!followedIds.length) return opts.existingIds;

  const existing = new Set(opts.existingIds);
  const injected = followedIds.filter((id) => !existing.has(id));
  return [...injected, ...opts.existingIds].slice(0, POOL_CAP);
}

export async function searchRecommendedPage(
  filters: CollectionFilters,
): Promise<CollectionPage> {
  const [excludeOwnerIds, followeeIds] = await Promise.all([
    hiddenOwnerIds(filters.viewerId),
    followedOwnerIds(filters.viewerId),
  ]);
  const candidateIds = await fetchSearchCandidateIds({
    q: filters.q,
    lat: filters.lat,
    lng: filters.lng,
    radius: filters.radius,
    conditions: filters.conditions,
    category: filters.category,
    excludeUserId: filters.viewerId,
    excludeOwnerIds,
    country: filters.country,
    cap: POOL_CAP,
  });

  const mergedIds = await injectFollowedListingIds({
    viewerId: filters.viewerId,
    followeeIds: followeeIds.filter((id) => !excludeOwnerIds.includes(id)),
    existingIds: candidateIds,
  });
  if (!mergedIds.length) return emptyPage();

  const ordered = await rankOrKeepOrder({
    viewerId: filters.viewerId,
    country: filters.country,
    candidateIds: mergedIds,
    excludeIds: [],
    excludeOwnerIds,
    followedOwnerIds: followeeIds,
  });
  const { page, total, nextOffset } = slicePage(ordered, filters.offset, filters.limit);
  if (!page.length) return { listings: [], total, nextOffset };
  const listings = await serializeListingsByIds(page);
  return { listings, total, nextOffset };
}

export async function searchRelatedPage(
  filters: CollectionFilters & { listingId: string },
): Promise<CollectionPage> {
  const seed = await db.query.listingsTable.findFirst({
    where: and(eq(listingsTable.id, filters.listingId), ne(listingsTable.status, "deleted")),
    columns: {
      id: true,
      userId: true,
      locationCountry: true,
    },
  });
  if (!seed) return emptyPage();

  const [swiped, negotiations, hiddenOwners] = await Promise.all([
    db
      .select({ listingId: swipesTable.listingId })
      .from(swipesTable)
      .where(eq(swipesTable.swiperId, filters.viewerId)),
    getActiveNegotiationListingIds(filters.viewerId),
    hiddenOwnerIds(filters.viewerId),
  ]);

  const excludeOwnerIds = [...new Set([...hiddenOwners, seed.userId])];
  const excludeIds = [
    ...new Set([
      seed.id,
      ...swiped.map((s) => s.listingId),
      ...negotiations,
    ]),
  ];

  const profileCountry = (
    await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, filters.viewerId),
      columns: { locationCountry: true },
    })
  )?.locationCountry;

  const country = filters.country || profileCountry || "";

  const candidateIds = await fetchSearchCandidateIds({
    q: filters.q,
    lat: filters.lat,
    lng: filters.lng,
    radius: filters.radius,
    conditions: filters.conditions,
    category: filters.category,
    excludeUserId: filters.viewerId,
    excludeListingIds: excludeIds,
    excludeOwnerIds,
    country: country || undefined,
    cap: POOL_CAP,
  });
  if (!candidateIds.length) return emptyPage();

  const ordered = await rankOrKeepOrder({
    viewerId: filters.viewerId,
    country: country || filters.country,
    candidateIds,
    excludeIds,
    excludeOwnerIds,
    listingId: seed.id,
  });
  const { page, total, nextOffset } = slicePage(ordered, filters.offset, filters.limit);
  if (!page.length) return { listings: [], total, nextOffset };
  const listings = await serializeListingsByIds(page);
  return { listings, total, nextOffset };
}
