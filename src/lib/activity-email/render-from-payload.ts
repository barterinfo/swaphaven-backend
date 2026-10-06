import type { ActivityEmailPayload } from "../../db/schema/activity_email.js";
import type { ActivityEmailEventType } from "./enqueue.js";
import { inboxUrl } from "./links.js";
import {
  renderActivityDigest,
  renderCashCounter,
  renderChatMessage,
  renderListingSaved,
  renderNewCashOffer,
  renderNewSwapOffer,
  renderOfferAccepted,
  renderOfferDeclined,
  renderOfferWithdrawn,
  renderSwapCounter,
  type ActivityEmailRendered,
} from "./templates.js";

function str(payload: ActivityEmailPayload, key: string, fallback = ""): string {
  const v = payload[key];
  return typeof v === "string" ? v : fallback;
}

function strOrNull(payload: ActivityEmailPayload, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" ? v : null;
}

export function renderFromOutboxRow(row: {
  eventType: string;
  payload: ActivityEmailPayload;
}): ActivityEmailRendered | null {
  const p = row.payload;
  switch (row.eventType as ActivityEmailEventType) {
    case "new_swap_offer":
      return renderNewSwapOffer({
        listingTitle: str(p, "listingTitle", "your item"),
        senderName: str(p, "senderName", "Someone"),
        offeredItemsLabel: str(p, "offeredItemsLabel", "items"),
        imageUrl: strOrNull(p, "imageUrl"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "new_cash_offer":
      return renderNewCashOffer({
        listingTitle: str(p, "listingTitle", "your item"),
        senderName: str(p, "senderName", "Someone"),
        cashLabel: str(p, "cashLabel", "$0"),
        imageUrl: strOrNull(p, "imageUrl"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "swap_counter":
      return renderSwapCounter({
        listingTitle: str(p, "listingTitle", "your item"),
        senderName: str(p, "senderName", "Someone"),
        theirItemsLabel: str(p, "theirItemsLabel", "items"),
        imageUrl: strOrNull(p, "imageUrl"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "cash_counter":
      return renderCashCounter({
        listingTitle: str(p, "listingTitle", "your item"),
        senderName: str(p, "senderName", "Someone"),
        cashLabel: str(p, "cashLabel", "$0"),
        imageUrl: strOrNull(p, "imageUrl"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "offer_accepted":
      return renderOfferAccepted({
        listingTitle: str(p, "listingTitle", "your item"),
        accepterName: str(p, "accepterName", "Someone"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "offer_declined":
      return renderOfferDeclined({
        listingTitle: str(p, "listingTitle", "your item"),
        headline: str(p, "headline", "Your offer was declined."),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "offer_withdrawn":
      return renderOfferWithdrawn({
        listingTitle: str(p, "listingTitle", "your item"),
        buyerName: str(p, "buyerName", "Someone"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "new_message":
      return renderChatMessage({
        listingTitle: str(p, "listingTitle", "your item"),
        senderName: str(p, "senderName", "Someone"),
        quote: str(p, "quote", ""),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    case "listing_saved":
      return renderListingSaved({
        listingTitle: str(p, "listingTitle", "your item"),
        saverName: str(p, "saverName", "Someone"),
        listingImageUrl: strOrNull(p, "listingImageUrl"),
        saverAvatarUrl: strOrNull(p, "saverAvatarUrl"),
        buttonUrl: str(p, "buttonUrl", inboxUrl()),
      });
    default:
      return null;
  }
}

export function renderDigestFromRows(
  rows: { summary: string }[],
): ActivityEmailRendered {
  return renderActivityDigest({
    summaries: rows.map((r) => r.summary),
    buttonUrl: inboxUrl(),
  });
}
