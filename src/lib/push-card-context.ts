import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  listingsTable,
  listingImagesTable,
  userProfilesTable,
  offerRoundsTable,
} from "../db/schema/index.js";
import type { PushPayload } from "./push.js";

/** Listing fields needed to populate native push cards. */
export interface PushListingSummary {
  id: string;
  title: string;
  estimatedValueCents: number;
  imageUrl?: string;
}

export interface PushSideSummary {
  itemName: string;
  imageUrl?: string;
  totalCents: number;
}

function resolveValueCents(listing: {
  estimatedValueCents?: number | null;
  estimatedValue?: number | null;
}): number {
  if (listing.estimatedValueCents != null) return listing.estimatedValueCents;
  if (listing.estimatedValue != null) return listing.estimatedValue * 100;
  return 0;
}

/** Join multi-item titles the way native cards expect ("A + B"). */
export function joinItemNames(titles: string[]): string {
  return titles.map((t) => t.trim()).filter(Boolean).join(" + ");
}

export function formatUsdFromCents(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

export function valueLabelFromCents(cents: number): string {
  return `Estimated value: ${formatUsdFromCents(cents)} total`;
}

/** Fair when both sides have value and relative gap ≤ 15%. */
export function isFairTrade(theirCents: number, yourCents: number): boolean {
  if (theirCents <= 0 || yourCents <= 0) return false;
  const max = Math.max(theirCents, yourCents);
  const min = Math.min(theirCents, yourCents);
  return (max - min) / max <= 0.15;
}

export async function loadDisplayName(userId: string): Promise<string> {
  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, userId),
    columns: { displayName: true },
  });
  return profile?.displayName?.trim() || "Someone";
}

/**
 * Load listings (preserving input order) with first image URL and value cents.
 */
export async function loadListingsForPush(
  listingIds: string[],
): Promise<PushListingSummary[]> {
  if (listingIds.length === 0) return [];

  const listings = await db.query.listingsTable.findMany({
    where: inArray(listingsTable.id, listingIds),
    columns: {
      id: true,
      title: true,
      estimatedValue: true,
      estimatedValueCents: true,
    },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));

  const images = await db
    .select({
      listingId: listingImagesTable.listingId,
      url: listingImagesTable.url,
      position: listingImagesTable.position,
    })
    .from(listingImagesTable)
    .where(inArray(listingImagesTable.listingId, listingIds))
    .orderBy(asc(listingImagesTable.position));

  const firstImage = new Map<string, string>();
  for (const img of images) {
    if (!firstImage.has(img.listingId)) firstImage.set(img.listingId, img.url);
  }

  const result: PushListingSummary[] = [];
  for (const id of listingIds) {
    const row = byId.get(id);
    if (!row) continue;
    result.push({
      id: row.id,
      title: row.title,
      estimatedValueCents: resolveValueCents(row),
      imageUrl: firstImage.get(id),
    });
  }
  return result;
}

export function summarizeSide(listings: PushListingSummary[]): PushSideSummary {
  const itemName = joinItemNames(listings.map((l) => l.title)) || "item";
  const totalCents = listings.reduce((sum, l) => sum + l.estimatedValueCents, 0);
  const imageUrl = listings.find((l) => l.imageUrl)?.imageUrl;
  return { itemName, totalCents, ...(imageUrl ? { imageUrl } : {}) };
}

/** Most recent round item sides for an offer (accepted round preferred). */
export async function loadRoundSidesForPush(offerId: string): Promise<{
  buyerListingIds: string[];
  sellerListingIds: string[];
} | null> {
  const round = await db.query.offerRoundsTable.findFirst({
    where: eq(offerRoundsTable.offerId, offerId),
    orderBy: [desc(offerRoundsTable.roundNumber)],
    with: {
      items: {
        columns: { listingId: true, side: true, position: true },
      },
    },
  });
  if (!round) return null;

  const sorted = [...round.items].sort((a, b) => a.position - b.position);
  const buyerListingIds = sorted
    .filter((i) => i.side === "buyer")
    .map((i) => i.listingId);
  const sellerListingIds = sorted
    .filter((i) => i.side === "seller")
    .map((i) => i.listingId);
  return { buyerListingIds, sellerListingIds };
}

export async function buildOfferPush(args: {
  offerId: string;
  senderUserId: string;
  theirListingIds: string[];
  yourListingIds: string[];
}): Promise<PushPayload> {
  const [senderName, theirListings, yourListings] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.theirListingIds),
    loadListingsForPush(args.yourListingIds),
  ]);
  const their = summarizeSide(theirListings);
  const yours = summarizeSide(yourListings);
  const title = `New Trade Offer from ${senderName}`;
  const body = `${senderName} wants to swap their ${their.itemName} for your ${yours.itemName}.`;

  return {
    title,
    body,
    data: {
      type: "offer",
      offerId: args.offerId,
      senderName,
      theirItemName: their.itemName,
      yourItemName: yours.itemName,
      ...(isFairTrade(their.totalCents, yours.totalCents) ? { fairTrade: "true" } : {}),
      ...(their.imageUrl ? { theirImageUrl: their.imageUrl } : {}),
      ...(yours.imageUrl ? { yourImageUrl: yours.imageUrl } : {}),
      timestampLabel: "now",
    },
  };
}

export async function buildCounterOfferPush(args: {
  offerId: string;
  senderUserId: string;
  /** Sender's side listing IDs (shown in "What changed"). */
  theirListingIds: string[];
}): Promise<PushPayload> {
  const [senderName, theirListings] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.theirListingIds),
  ]);
  const their = summarizeSide(theirListings);
  const title = `${senderName} sweetened the deal`;
  const body = `${senderName} updated their offer with ${their.itemName}.`;

  return {
    title,
    body,
    data: {
      type: "counter_offer",
      offerId: args.offerId,
      senderName,
      theirItemName: their.itemName,
      valueLabel: valueLabelFromCents(their.totalCents),
      ...(their.imageUrl ? { theirImageUrl: their.imageUrl } : {}),
      timestampLabel: "now",
    },
  };
}

export async function buildOfferAcceptedPush(args: {
  offerId: string;
  conversationId: string;
  senderUserId: string;
  /** Recipient's side (your*). */
  yourListingIds: string[];
  /** Accepter's side (their*). */
  theirListingIds: string[];
}): Promise<PushPayload> {
  const [senderName, theirListings, yourListings] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.theirListingIds),
    loadListingsForPush(args.yourListingIds),
  ]);
  const their = summarizeSide(theirListings);
  const yours = summarizeSide(yourListings);
  const title = "Offer Accepted!";
  const body = `${senderName} accepted your offer. Your ${yours.itemName} is heading to a new home!`;

  return {
    title,
    body,
    data: {
      type: "offer_accepted",
      conversationId: args.conversationId,
      offerId: args.offerId,
      senderName,
      yourItemName: yours.itemName,
      theirItemName: their.itemName,
      ...(yours.imageUrl ? { yourImageUrl: yours.imageUrl } : {}),
      ...(their.imageUrl ? { theirImageUrl: their.imageUrl } : {}),
      timestampLabel: "now",
    },
  };
}
