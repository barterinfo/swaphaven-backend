import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  listingEmbeddingsTable,
  listingsTable,
  notificationsTable,
  userWantsTable,
} from "../db/schema/index.js";
import { computeMatchScore } from "./match-score.js";
import { embedListingAwait } from "./barter-ai.js";
import { sendPushToUser } from "./push.js";

const MATCH_THRESHOLD = 0.72;
const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FANOUT_MAX = 200;

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const nums = raw.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

function categoryMatchScore(
  listingCategory: string,
  listingCategorySlug: string | null | undefined,
  wantSlug: string | null | undefined,
  queryText: string,
): number {
  const cat = listingCategory.trim().toLowerCase();
  const slug = (listingCategorySlug ?? "").trim().toLowerCase();
  const want = (wantSlug ?? "").trim().toLowerCase();
  const q = queryText.trim().toLowerCase();
  if (want && (want === slug || want === cat)) return 1;
  if (q && (cat.includes(q) || slug.includes(q) || q.includes(cat))) return 0.7;
  return 0;
}

/**
 * After a listing is published: embed (if needed), score active wants, notify.
 * Fire-and-forget — never throws into the create-listing path.
 */
export function scheduleWantMatch(listingId: string): void {
  void matchWantsForListing(listingId).catch((err) => {
    console.error("[want-match]", err);
  });
}

export async function matchWantsForListing(listingId: string): Promise<void> {
  try {
    await embedListingAwait(listingId);
  } catch (err) {
    console.error("[want-match] embed failed:", err);
  }

  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
    with: { categoryRow: true },
  });
  if (!listing || listing.status !== "active") return;

  const embedRow = await db.query.listingEmbeddingsTable.findFirst({
    where: eq(listingEmbeddingsTable.listingId, listingId),
    columns: { embedding: true },
  });
  const listingEmbedding = parseEmbedding(embedRow?.embedding);

  const wants = await db
    .select()
    .from(userWantsTable)
    .where(
      and(
        eq(userWantsTable.status, "active"),
        ne(userWantsTable.userId, listing.userId),
      ),
    )
    .limit(FANOUT_MAX * 2);

  if (!wants.length) return;

  type Hit = {
    want: typeof wants[number];
    score: number;
  };
  const hits: Hit[] = [];

  for (const want of wants) {
    const wantEmb = parseEmbedding(want.embedding);
    const cos =
      listingEmbedding && wantEmb
        ? (cosineSimilarity(listingEmbedding, wantEmb) + 1) / 2
        : 0;
    const cat = categoryMatchScore(
      listing.category,
      listing.categoryRow?.slug,
      want.categorySlug,
      want.queryText,
    );
    // Keyword fallback when embeddings are missing.
    const titleHit = listing.title
      .toLowerCase()
      .includes(want.queryText.trim().toLowerCase())
      ? 0.6
      : 0;
    const semantic = cos > 0 ? cos : titleHit;
    const score = 0.75 * semantic + 0.25 * cat;
    if (score >= MATCH_THRESHOLD) {
      hits.push({ want, score });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  const byUser = new Map<string, Hit>();
  for (const hit of hits) {
    if (!byUser.has(hit.want.userId)) byUser.set(hit.want.userId, hit);
  }

  const recipients = [...byUser.values()].slice(0, FANOUT_MAX);
  const now = Date.now();

  for (const hit of recipients) {
    const { want, score } = hit;
    if (
      want.lastNotifiedAt &&
      now - want.lastNotifiedAt.getTime() < NOTIFY_COOLDOWN_MS &&
      score < MATCH_THRESHOLD + 0.1
    ) {
      continue;
    }

    // Closet mutual-fit copy (best-effort).
    const closet = await db.query.listingsTable.findMany({
      where: and(
        eq(listingsTable.userId, want.userId),
        eq(listingsTable.status, "active"),
      ),
      columns: { id: true, title: true, category: true },
      limit: 20,
    });
    const closetCats = new Set(
      closet.map((l) => l.category.trim().toLowerCase()).filter(Boolean),
    );
    const fit = computeMatchScore(listing.wantedCategories ?? [], closetCats);
    const closetItem = closet.find(
      (l) =>
        fit.matchedWantedLabels.some(
          (label) => label.trim().toLowerCase() === l.category.trim().toLowerCase(),
        ),
    );

    const wantedLabel =
      (listing.wantedCategories ?? [])[0]?.trim() ||
      listing.wantedCategories?.join(", ") ||
      "something in return";
    const title = `${listing.title} was just listed`;
    let body = `They want ${wantedLabel}.`;
    if (closetItem) {
      body = `They want ${wantedLabel}. Your ${closetItem.title} fits.`;
    }

    await db.insert(notificationsTable).values({
      userId: want.userId,
      type: "want_match",
      title,
      body,
      relatedListingId: listing.id,
      actorUserId: listing.userId,
    });

    await sendPushToUser(want.userId, {
      title,
      body,
      data: {
        type: "want_match",
        listingId: listing.id,
        title,
        body,
      },
    });

    await db
      .update(userWantsTable)
      .set({ lastNotifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(userWantsTable.id, want.id));
  }
}

/** Mark matching active wants fulfilled when the seeker offers on a notified listing. */
export async function fulfillWantsOnOffer(opts: {
  buyerId: string;
  listingId: string;
}): Promise<void> {
  const recent = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.userId, opts.buyerId),
        eq(notificationsTable.type, "want_match"),
        eq(notificationsTable.relatedListingId, opts.listingId),
      ),
    )
    .limit(1);
  if (!recent.length) return;

  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, opts.listingId),
    columns: { title: true, category: true },
    with: { categoryRow: { columns: { slug: true } } },
  });
  if (!listing) return;

  const title = listing.title.toLowerCase();
  const slug = (listing.categoryRow?.slug ?? "").toLowerCase();
  const wants = await db
    .select()
    .from(userWantsTable)
    .where(
      and(
        eq(userWantsTable.userId, opts.buyerId),
        eq(userWantsTable.status, "active"),
      ),
    );

  const ids = wants
    .filter((w) => {
      const q = w.queryNormalized;
      if (q && title.includes(q)) return true;
      if (w.categorySlug && w.categorySlug.toLowerCase() === slug) return true;
      return false;
    })
    .map((w) => w.id);

  if (!ids.length) return;
  await db
    .update(userWantsTable)
    .set({ status: "fulfilled", updatedAt: new Date() })
    .where(inArray(userWantsTable.id, ids));
}

/** Expire wants older than 30 days. */
export async function expireStaleWants(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const updated = await db
    .update(userWantsTable)
    .set({ status: "fulfilled", updatedAt: new Date() })
    .where(
      and(
        eq(userWantsTable.status, "active"),
        sql`${userWantsTable.createdAt} < ${cutoff}`,
      ),
    )
    .returning({ id: userWantsTable.id });
  return updated.length;
}
