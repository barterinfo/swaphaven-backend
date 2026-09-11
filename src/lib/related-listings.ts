import { and, asc, desc, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingsTable } from "../db/schema/index.js";
import { serializeListingBarter } from "./barter-listing.js";

async function loadImagesForRows(
  rows: { id: string; images?: { url: string; position: number }[] }[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const row of rows) {
    const urls = (row.images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => i.url);
    out.set(row.id, urls);
  }
  return out;
}

/** Hydrate ranked IDs in rank order using the mobile listing card shape. */
export async function serializeListingsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.query.listingsTable.findMany({
    where: and(inArray(listingsTable.id, ids), ne(listingsTable.status, "deleted")),
    with: { images: true, categoryRow: true },
  });
  const images = await loadImagesForRows(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) =>
      serializeListingBarter(row, { images: images.get(row.id) ?? [] }),
    );
}

/** Category + similar-value ranking when barter-ai is skipped or down. */
export async function fallbackRelatedIds(opts: {
  seedId: string;
  seedUserId: string;
  seedCategoryId: string | null;
  seedCategory: string;
  seedValueCents: number;
  country: string;
  viewerId?: string;
  excludeIds: string[];
  excludeOwnerIds: string[];
  limit: number;
}): Promise<string[]> {
  const exclude = [...new Set([...opts.excludeIds, opts.seedId])];
  const owners = [...new Set([...opts.excludeOwnerIds, opts.seedUserId])];
  const conditions = [
    eq(listingsTable.status, "active"),
    or(
      eq(listingsTable.locationCountry, opts.country),
      eq(listingsTable.locationCountry, ""),
    ),
  ];
  if (exclude.length) conditions.push(notInArray(listingsTable.id, exclude));
  if (owners.length) conditions.push(notInArray(listingsTable.userId, owners));
  if (opts.viewerId) {
    conditions.push(sql`${listingsTable.userId} != ${opts.viewerId}`);
  }

  const categoryMatch = opts.seedCategoryId
    ? sql`(${listingsTable.categoryId} = ${opts.seedCategoryId})`
    : sql`(lower(${listingsTable.category}) = ${opts.seedCategory.toLowerCase()})`;

  const rows = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(and(...conditions))
    .orderBy(
      desc(categoryMatch),
      asc(sql`abs(${listingsTable.estimatedValueCents} - ${opts.seedValueCents})`),
      desc(listingsTable.rightSwipeCount),
      desc(listingsTable.createdAt),
    )
    .limit(opts.limit);

  return rows.map((r) => r.id);
}
