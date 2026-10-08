import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  conversationsTable,
  listingsTable,
  listingImagesTable,
  offersTable,
  userProfilesTable,
} from "../../db/schema/index.js";
import {
  formatUsdFromCents,
  loadDisplayName,
  loadListingsForPush,
  summarizeSide,
} from "../push-card-context.js";
import {
  inboxChatUrl,
  inboxOfferUrl,
  profileUrl,
} from "./links.js";
import { enqueueActivityEmail } from "./enqueue.js";

async function listingTitleAndImage(listingId: string): Promise<{
  title: string;
  imageUrl: string | null;
}> {
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, listingId),
    columns: { title: true },
  });
  const [img] = await db
    .select({ url: listingImagesTable.url })
    .from(listingImagesTable)
    .where(eq(listingImagesTable.listingId, listingId))
    .orderBy(asc(listingImagesTable.position))
    .limit(1);
  return {
    title: listing?.title?.trim() || "your item",
    imageUrl: img?.url ?? null,
  };
}

export async function notifyNewSwapOffer(args: {
  offerId: string;
  senderUserId: string;
  theirListingIds: string[];
  yourListingId: string;
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { sellerId: true },
  });
  if (!offer) return;

  const [senderName, theirListings, { title, imageUrl }] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.theirListingIds),
    listingTitleAndImage(args.yourListingId),
  ]);
  const their = summarizeSide(theirListings);

  await enqueueActivityEmail({
    userId: offer.sellerId,
    eventType: "new_swap_offer",
    summary: `${senderName} wants to swap for your ${title}`,
    payload: {
      listingTitle: title,
      senderName,
      offeredItemsLabel: their.itemName,
      imageUrl,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifyNewCashOffer(args: {
  offerId: string;
  senderUserId: string;
  cashTopUpCents: number;
  listingId: string;
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { sellerId: true },
  });
  if (!offer) return;

  const cashLabel = formatUsdFromCents(args.cashTopUpCents);
  const [senderName, { title, imageUrl }] = await Promise.all([
    loadDisplayName(args.senderUserId),
    listingTitleAndImage(args.listingId),
  ]);

  await enqueueActivityEmail({
    userId: offer.sellerId,
    eventType: "new_cash_offer",
    summary: `${senderName} offered ${cashLabel} for your ${title}`,
    payload: {
      listingTitle: title,
      senderName,
      cashLabel,
      imageUrl,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifySwapCounter(args: {
  offerId: string;
  senderUserId: string;
  theirListingIds: string[];
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { buyerId: true, sellerId: true, listingId: true },
  });
  if (!offer) return;

  const notifyUserId =
    args.senderUserId === offer.buyerId ? offer.sellerId : offer.buyerId;

  const [senderName, theirListings, { title, imageUrl }] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.theirListingIds),
    listingTitleAndImage(offer.listingId),
  ]);
  const their = summarizeSide(theirListings);

  await enqueueActivityEmail({
    userId: notifyUserId,
    eventType: "swap_counter",
    summary: `${senderName} sent new swap terms for ${title}`,
    payload: {
      listingTitle: title,
      senderName,
      theirItemsLabel: their.itemName,
      imageUrl,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifyCashCounter(args: {
  offerId: string;
  senderUserId: string;
  buyerCashTopUpCents: number;
  sellerCashRequestedCents: number;
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { buyerId: true, sellerId: true, listingId: true },
  });
  if (!offer) return;

  const notifyUserId =
    args.senderUserId === offer.buyerId ? offer.sellerId : offer.buyerId;
  const cashCents =
    args.buyerCashTopUpCents > 0
      ? args.buyerCashTopUpCents
      : args.sellerCashRequestedCents;
  const cashLabel = formatUsdFromCents(cashCents);

  const [senderName, { title, imageUrl }] = await Promise.all([
    loadDisplayName(args.senderUserId),
    listingTitleAndImage(offer.listingId),
  ]);

  await enqueueActivityEmail({
    userId: notifyUserId,
    eventType: "cash_counter",
    summary: `${senderName} proposed ${cashLabel} for ${title}`,
    payload: {
      listingTitle: title,
      senderName,
      cashLabel,
      imageUrl,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifyOfferAccepted(args: {
  offerId: string;
  conversationId: string;
  accepterUserId: string;
  notifyUserId: string;
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { listingId: true },
  });
  if (!offer) return;

  const [accepterName, { title }] = await Promise.all([
    loadDisplayName(args.accepterUserId),
    listingTitleAndImage(offer.listingId),
  ]);

  await enqueueActivityEmail({
    userId: args.notifyUserId,
    eventType: "offer_accepted",
    summary: `${accepterName} accepted the trade for ${title}`,
    payload: {
      listingTitle: title,
      accepterName,
      buttonUrl: inboxChatUrl(args.conversationId),
    },
  });
}

export type OfferDeclinedReason = "manual" | "listing_sold" | "listing_deleted";

export async function notifyOfferDeclined(args: {
  offerId: string;
  notifyUserId: string;
  listingTitle: string;
  reason: OfferDeclinedReason;
}): Promise<void> {
  const headline =
    args.reason === "listing_sold"
      ? `${args.listingTitle} was marked as sold. Your offer was declined.`
      : args.reason === "listing_deleted"
        ? `${args.listingTitle} was removed. Your offer was declined.`
        : `Your offer for ${args.listingTitle} was declined.`;

  await enqueueActivityEmail({
    userId: args.notifyUserId,
    eventType: "offer_declined",
    summary: headline,
    payload: {
      listingTitle: args.listingTitle,
      headline,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifyOfferWithdrawn(args: {
  offerId: string;
  buyerUserId: string;
}): Promise<void> {
  const offer = await db.query.offersTable.findFirst({
    where: eq(offersTable.id, args.offerId),
    columns: { sellerId: true, listingId: true },
  });
  if (!offer) return;

  const [buyerName, { title }] = await Promise.all([
    loadDisplayName(args.buyerUserId),
    listingTitleAndImage(offer.listingId),
  ]);

  await enqueueActivityEmail({
    userId: offer.sellerId,
    eventType: "offer_withdrawn",
    summary: `${buyerName} withdrew their offer for ${title}`,
    payload: {
      listingTitle: title,
      buyerName,
      buttonUrl: inboxOfferUrl(args.offerId),
    },
  });
}

export async function notifyChatMessage(args: {
  conversationId: string;
  senderUserId: string;
  preview: string;
}): Promise<void> {
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, args.conversationId),
    with: {
      offer: { columns: { listingId: true, buyerId: true, sellerId: true } },
    },
  });
  if (!conv?.offer) return;

  const notifyUserId =
    args.senderUserId === conv.offer.buyerId
      ? conv.offer.sellerId
      : conv.offer.buyerId;

  const [senderName, { title }] = await Promise.all([
    loadDisplayName(args.senderUserId),
    listingTitleAndImage(conv.offer.listingId),
  ]);

  await enqueueActivityEmail({
    userId: notifyUserId,
    eventType: "new_message",
    coalesceKey: `new_message:${args.conversationId}`,
    summary: `${senderName} messaged you about ${title}`,
    payload: {
      listingTitle: title,
      senderName,
      quote: args.preview,
      buttonUrl: inboxChatUrl(args.conversationId),
      messageCount: 1,
    },
  });
}

export async function notifyListingSaved(args: {
  listingId: string;
  saverUserId: string;
}): Promise<void> {
  const listing = await db.query.listingsTable.findFirst({
    where: eq(listingsTable.id, args.listingId),
    columns: { userId: true, title: true },
  });
  if (!listing) return;
  if (listing.userId === args.saverUserId) return;

  const [saverName, saverProfile, listingImg] = await Promise.all([
    loadDisplayName(args.saverUserId),
    db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, args.saverUserId),
      columns: { avatarUrl: true },
    }),
    db
      .select({ url: listingImagesTable.url })
      .from(listingImagesTable)
      .where(eq(listingImagesTable.listingId, args.listingId))
      .orderBy(asc(listingImagesTable.position))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const title = listing.title?.trim() || "your item";

  await enqueueActivityEmail({
    userId: listing.userId,
    eventType: "listing_saved",
    summary: `${saverName} bookmarked your ${title}`,
    payload: {
      listingTitle: title,
      saverName,
      listingImageUrl: listingImg?.url ?? null,
      saverAvatarUrl: saverProfile?.avatarUrl ?? null,
      buttonUrl: profileUrl(args.saverUserId),
    },
  });
}
