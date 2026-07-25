import { and, asc, count, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingImagesTable, listingsTable } from "../db/schema/index.js";
import type { Listing } from "../db/schema/listings.js";
import { getActiveNegotiationListingIds } from "../lib/active-offer-listings.js";
import { serializeListingBarter } from "../lib/barter-listing.js";
import { normalizeQuery, tokenizeQuery } from "./normalize.js";
import type { SearchListingParams, SearchSort } from "./types.js";

function haversineMilesSql(lat: number, lng: number): SQL<number> {
  return sql<number>`(
    2 * 3958.8 * asin(
      sqrt(
        power(sin((radians(${lat}) - radians(${listingsTable.locationLat}::float)) / 2), 2)
        + cos(radians(${listingsTable.locationLat}::float))
        * cos(radians(${lat}))
        * power(sin((radians(${lng}) - radians(${listingsTable.locationLng}::float)) / 2), 2)
      )
    )
  )`;
}

function buildFilterConditions(params: SearchListingParams): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [eq(listingsTable.status, "active")];

  if (params.excludeUserId) {
    conditions.push(ne(listingsTable.userId, params.excludeUserId));
  }

  if (params.excludeListingIds && params.excludeListingIds.length > 0) {
    conditions.push(notInArray(listingsTable.id, params.excludeListingIds));
  }

  const tokens = tokenizeQuery(normalizeQuery(params.q));
  for (const token of tokens) {
    const pattern = `%${token}%`;
    conditions.push(
      or(
        sql`${listingsTable.title} ILIKE ${pattern}`,
        sql`${listingsTable.description} ILIKE ${pattern}`,
      )!,
    );
  }

  if (params.conditions && params.conditions.length > 0) {
    conditions.push(inArray(listingsTable.condition, params.conditions));
  }

  if (params.category && params.category.trim()) {
    // Mobile sends browse ids/slugs (e.g. "books"); seeded listings often store
    // display labels ("Books", "Home & Kitchen"). Match both.
    const slug = params.category.trim().toLowerCase();
    conditions.push(
      sql`(
        LOWER(${listingsTable.category}) = ${slug}
        OR LOWER(REPLACE(REPLACE(${listingsTable.category}, ' & ', '_'), ' ', '_')) = ${slug}
        OR (
          ${slug} = 'sports_fitness'
          AND LOWER(${listingsTable.category}) IN ('sports', 'sports & fitness')
        )
        OR (
          ${slug} = 'toys_games'
          AND LOWER(${listingsTable.category}) = 'gaming'
        )
        OR (
          ${slug} = 'garden_outdoor'
          AND LOWER(${listingsTable.category}) = 'garden'
        )
      )`,
    );
  }

  const hasGeo =
    params.lat != null &&
    params.lng != null &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng);
  const hasRadius =
    params.radius != null && Number.isFinite(params.radius) && params.radius > 0;

  if (hasGeo && hasRadius) {
    const distance = haversineMilesSql(params.lat!, params.lng!);
    conditions.push(sql`${listingsTable.locationLat} IS NOT NULL`);
    conditions.push(sql`${listingsTable.locationLng} IS NOT NULL`);
    conditions.push(sql`${distance} <= ${params.radius!}`);
  }

  return conditions;
}

function resolveSort(params: SearchListingParams): SearchSort {
  if (params.sort) return params.sort;
  const hasQ = tokenizeQuery(normalizeQuery(params.q)).length > 0;
  const hasGeo =
    params.lat != null &&
    params.lng != null &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng);
  if (hasQ) return "best_match";
  if (hasGeo) return "nearest";
  return "newest";
}

function titleHitSql(tokens: string[]): SQL<number> {
  if (tokens.length === 0) {
    return sql<number>`(0)::int`;
  }
  return sql<number>`CASE WHEN (${or(
    ...tokens.map((t) => sql`${listingsTable.title} ILIKE ${`%${t}%`}`),
  )}) THEN 1 ELSE 0 END`;
}

function nearbyBoostSql(distanceExpr: SQL<number> | null): SQL<number> {
  if (!distanceExpr) return sql<number>`(0)::float`;
  return sql<number>`(1.0 / (1.0 + COALESCE(${distanceExpr}, 100)))`;
}

async function loadImagesByListingIds(
  listingIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (listingIds.length === 0) return map;

  const rows = await db
    .select({
      listingId: listingImagesTable.listingId,
      url: listingImagesTable.url,
      position: listingImagesTable.position,
    })
    .from(listingImagesTable)
    .where(inArray(listingImagesTable.listingId, listingIds))
    .orderBy(asc(listingImagesTable.position));

  for (const row of rows) {
    const list = map.get(row.listingId) ?? [];
    list.push(row.url);
    map.set(row.listingId, list);
  }
  return map;
}

export async function searchListings(params: SearchListingParams): Promise<{
  listings: Array<ReturnType<typeof serializeListingBarter> & { distance_miles: number | null }>;
  total: number;
  nextOffset: number | null;
}> {
  // seedIds accepted for Phase 2 — ignored here.
  void params.seedIds;

  let excludeListingIds = params.excludeListingIds ?? [];
  if (params.excludeUserId && excludeListingIds.length === 0) {
    excludeListingIds = await getActiveNegotiationListingIds(params.excludeUserId);
  }
  const filterConditions = buildFilterConditions({
    ...params,
    excludeListingIds,
  });
  const whereClause = and(...filterConditions);
  const tokens = tokenizeQuery(normalizeQuery(params.q));
  const sort = resolveSort(params);
  const hasGeo =
    params.lat != null &&
    params.lng != null &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng);
  const distanceExpr = hasGeo
    ? haversineMilesSql(params.lat!, params.lng!)
    : null;

  const titleHit = titleHitSql(tokens);
  const nearbyBoost = nearbyBoostSql(distanceExpr);

  const [totalRow] = await db
    .select({ value: count() })
    .from(listingsTable)
    .where(whereClause);
  const total = Number(totalRow?.value ?? 0);

  let orderBy: SQL<unknown>[];
  switch (sort) {
    case "nearest":
      orderBy = distanceExpr
        ? [sql`${distanceExpr} ASC NULLS LAST`, desc(listingsTable.createdAt)]
        : [desc(listingsTable.createdAt)];
      break;
    case "newest":
      orderBy = [desc(listingsTable.createdAt)];
      break;
    case "value_asc":
      orderBy = [asc(listingsTable.estimatedValue), desc(listingsTable.createdAt)];
      break;
    case "most_saved":
      orderBy = [desc(listingsTable.rightSwipeCount), desc(listingsTable.createdAt)];
      break;
    case "best_match":
    default:
      orderBy = [
        sql`${titleHit} DESC`,
        sql`${nearbyBoost} DESC`,
        desc(listingsTable.rightSwipeCount),
        desc(listingsTable.createdAt),
      ];
      break;
  }

  // Lean select — only columns needed for list serialization + ranking.
  // Avoid columns from newer migrations (e.g. sold_method) so search keeps
  // working if a deploy/migration is slightly behind.
  const rows = await db
    .select({
      id: listingsTable.id,
      userId: listingsTable.userId,
      title: listingsTable.title,
      description: listingsTable.description,
      category: listingsTable.category,
      condition: listingsTable.condition,
      estimatedValue: listingsTable.estimatedValue,
      acceptCashTopUps: listingsTable.acceptCashTopUps,
      wantedCategoryIds: listingsTable.wantedCategoryIds,
      wantedCategories: listingsTable.wantedCategories,
      details: listingsTable.details,
      reviewSnapshot: listingsTable.reviewSnapshot,
      viewCount: listingsTable.viewCount,
      rightSwipeCount: listingsTable.rightSwipeCount,
      status: listingsTable.status,
      locationCity: listingsTable.locationCity,
      locationLat: listingsTable.locationLat,
      locationLng: listingsTable.locationLng,
      locationAddress: listingsTable.locationAddress,
      locationState: listingsTable.locationState,
      locationCountry: listingsTable.locationCountry,
      locationPostalCode: listingsTable.locationPostalCode,
      createdAt: listingsTable.createdAt,
      distanceMiles: distanceExpr ?? sql<number | null>`NULL`,
      titleHit,
    })
    .from(listingsTable)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(params.limit)
    .offset(params.offset);

  const imageMap = await loadImagesByListingIds(rows.map((r) => r.id));

  const listings = rows.map((row) => {
    const listingForSerialize = {
      ...row,
      categoryId: null,
      estimatedValueCents: null,
      isSwipeOnly: false,
      soldMethod: null,
      tradedWithUserId: null,
      updatedAt: row.createdAt,
    } satisfies Listing;
    const barter = serializeListingBarter(listingForSerialize, {
      images: imageMap.get(row.id) ?? [],
    });
    const distance =
      row.distanceMiles != null && Number.isFinite(Number(row.distanceMiles))
        ? Math.round(Number(row.distanceMiles) * 10) / 10
        : null;
    return { ...barter, distance_miles: distance };
  });

  const nextOffset =
    params.offset + params.limit < total ? params.offset + params.limit : null;

  return { listings, total, nextOffset };
}
