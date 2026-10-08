/**
 * Wire-shape serializers for the mobile Unified Inbox (Offers + Chats tabs).
 *
 * The raw Drizzle relations expose internal columns (e.g. user rows carry
 * `passwordHash`) and use names like `items` that the mobile client does not
 * expect. These helpers flatten the data into the documented inbox DTOs and,
 * crucially, only surface safe public fields for users.
 */

import { listingValueCents } from "./barter-listing.js";

interface ProfileSummaryInput {
  displayName?: string | null;
  avatarUrl?: string | null;
  isVerified?: boolean | null;
}

interface UserSummaryInput {
  id: string;
  name?: string | null;
  profile?: ProfileSummaryInput | null;
}

/** Public-safe user summary — never leaks credentials or contact details. */
export function serializeUserSummary(user: UserSummaryInput | null | undefined) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.profile?.displayName ?? user.name ?? "",
    avatarUrl: user.profile?.avatarUrl ?? null,
    isVerified: user.profile?.isVerified ?? false,
  };
}

interface ListingImageInput { url: string }
interface ListingSummaryInput {
  id: string;
  title: string;
  estimatedValue?: number | null;
  estimatedValueCents?: number | null;
  /** Listing lifecycle status — used by mobile to strike sold/deleted items. */
  status?: string | null;
  images?: ListingImageInput[];
  user?: UserSummaryInput | null;
}

function resolveValueCents(listing: ListingSummaryInput): number {
  return listingValueCents(listing);
}

/** Options for listing summaries embedded in inbox offer payloads. */
export interface SerializeListingOptions {
  /**
   * Max image URLs to include. Defaults to 1 (list thumbs). Pass
   * `Number.POSITIVE_INFINITY` for offer-detail carousels.
   */
  maxImages?: number;
}

function serializeListingSummary(
  listing: ListingSummaryInput | null | undefined,
  opts?: SerializeListingOptions,
) {
  if (!listing) return null;
  const maxImages = opts?.maxImages ?? 1;
  const all = listing.images ?? [];
  const images = Number.isFinite(maxImages)
    ? all.slice(0, Math.max(0, maxImages))
    : all;
  return {
    id: listing.id,
    title: listing.title,
    estimatedValueCents: resolveValueCents(listing),
    status: listing.status ?? "active",
    images: images.map((img) => ({ url: img.url })),
    ...(listing.user ? { user: serializeUserSummary(listing.user) } : {}),
  };
}

interface OfferItemInput { id?: string; listing?: ListingSummaryInput | null }

function serializeOfferItem(item: OfferItemInput, opts?: SerializeListingOptions) {
  return {
    ...(item.id ? { id: item.id } : {}),
    listing: serializeListingSummary(item.listing, opts),
  };
}

interface OfferListInput {
  id: string;
  status: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  cashTopUpCents: number;
  isSuperlike?: boolean | null;
  currentTurn?: string | null;
  roundCount?: number | null;
  createdAt: Date;
  listing?: ListingSummaryInput | null;
  buyer?: UserSummaryInput | null;
  seller?: UserSummaryInput | null;
  items?: OfferItemInput[];
}

/** Documented `OfferPage` item shape (Offers tab). */
export function serializeOfferListItem(
  offer: OfferListInput,
  opts?: SerializeListingOptions,
) {
  return {
    id: offer.id,
    status: offer.status,
    buyerId: offer.buyerId,
    sellerId: offer.sellerId,
    listingId: offer.listingId,
    cashTopUpCents: offer.cashTopUpCents,
    /** True when the offer originated from a super-swipe (⭐). */
    isSuperlike: offer.isSuperlike ?? false,
    currentTurn: offer.currentTurn ?? null,
    roundCount: offer.roundCount ?? 0,
    createdAt: offer.createdAt,
    listing: serializeListingSummary(offer.listing, opts),
    buyer: serializeUserSummary(offer.buyer),
    seller: serializeUserSummary(offer.seller),
    offeredItems: (offer.items ?? []).map((item) => serializeOfferItem(item, opts)),
  };
}

// ─── Offer round serialization ────────────────────────────────────────────────

interface RoundItemInput {
  listing?: ListingSummaryInput | null;
  side: string;
  position: number;
}

interface OfferRoundInput {
  id: string;
  roundNumber: number;
  proposedBy: string;
  buyerCashTopUpCents: number;
  sellerCashRequestedCents: number;
  note?: string | null;
  status: string;
  createdAt: Date;
  items?: RoundItemInput[];
}

export function serializeOfferRound(
  round: OfferRoundInput,
  opts?: SerializeListingOptions,
) {
  const buyerItems = (round.items ?? [])
    .filter((i) => i.side === "buyer")
    .sort((a, b) => a.position - b.position)
    .map((i) => serializeListingSummary(i.listing, opts));
  const sellerItems = (round.items ?? [])
    .filter((i) => i.side === "seller")
    .sort((a, b) => a.position - b.position)
    .map((i) => serializeListingSummary(i.listing, opts));

  return {
    id: round.id,
    roundNumber: round.roundNumber,
    proposedBy: round.proposedBy,
    buyerCashTopUpCents: round.buyerCashTopUpCents,
    sellerCashRequestedCents: round.sellerCashRequestedCents,
    note: round.note ?? null,
    status: round.status,
    createdAt: round.createdAt,
    buyerItems,
    sellerItems,
  };
}

interface TradeInput {
  id: string;
  status: string;
  meetupScheduledAt?: Date | null;
  meetupLocation?: string | null;
}

interface MessageInput { body: string; senderId: string; createdAt: Date; type?: string }

interface ConversationOfferInput {
  id: string;
  status: string;
  buyerId: string;
  sellerId: string;
  listing?: ListingSummaryInput | null;
  buyer?: UserSummaryInput | null;
  seller?: UserSummaryInput | null;
  items?: OfferItemInput[];
  trade?: TradeInput | null;
}

interface ConversationListInput {
  id: string;
  createdAt: Date;
  offer?: ConversationOfferInput | null;
  initiatorId?: string | null;
  recipientId?: string | null;
  initiator?: UserSummaryInput | null;
  recipient?: UserSummaryInput | null;
  messages?: MessageInput[];
}

/** Documented `Conversation` item shape (Chats tab). */
export function serializeConversationListItem(
  conversation: ConversationListInput,
  currentUserId: string,
  unreadCount: number,
) {
  const offer = conversation.offer ?? null;
  const otherUserRaw = offer
    ? (offer.buyerId === currentUserId ? offer.seller : offer.buyer)
    : (conversation.initiatorId === currentUserId
      ? conversation.recipient
      : conversation.initiator);
  const lastMessage = conversation.messages?.[0] ?? null;
  const updatedAt = lastMessage?.createdAt ?? conversation.createdAt;

  return {
    id: conversation.id,
    offer: offer
      ? {
          id: offer.id,
          status: offer.status,
          listing: serializeListingSummary(offer.listing),
          offeredItems: (offer.items ?? []).map((item) => serializeOfferItem(item)),
        }
      : null,
    trade: offer?.trade
      ? {
          id: offer.trade.id,
          status: offer.trade.status,
          meetupScheduledAt: offer.trade.meetupScheduledAt ?? null,
          meetupLocation: offer.trade.meetupLocation ?? null,
        }
      : null,
    otherUser: serializeUserSummary(otherUserRaw),
    lastMessage: lastMessage
      ? {
          body: lastMessage.body,
          sentAt: lastMessage.createdAt,
          senderId: lastMessage.senderId,
          type: lastMessage.type ?? "text",
        }
      : null,
    unreadCount,
    updatedAt,
  };
}
