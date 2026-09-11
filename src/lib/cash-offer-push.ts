import type { PushPayload } from "./push.js";
import {
  formatUsdFromCents,
  loadDisplayName,
  loadListingsForPush,
  summarizeSide,
} from "./push-card-context.js";

/** Push for a cash-only create — does not change buildOfferPush. */
export async function buildCashOfferPush(args: {
  offerId: string;
  senderUserId: string;
  cashTopUpCents: number;
  yourListingIds: string[];
}): Promise<PushPayload> {
  const [senderName, yourListings] = await Promise.all([
    loadDisplayName(args.senderUserId),
    loadListingsForPush(args.yourListingIds),
  ]);
  const yours = summarizeSide(yourListings);
  const cashLabel = `${formatUsdFromCents(args.cashTopUpCents)} cash`;
  const title = `New Cash Offer from ${senderName}`;
  const body = `${senderName} offered ${cashLabel} for your ${yours.itemName}.`;

  return {
    title,
    body,
    data: {
      type: "offer",
      offerId: args.offerId,
      senderName,
      theirItemName: cashLabel,
      yourItemName: yours.itemName,
      ...(yours.imageUrl ? { yourImageUrl: yours.imageUrl } : {}),
      timestampLabel: "now",
    },
  };
}

/** Push when either party counters a cash-only deal with a new cash amount. */
export async function buildCashCounterOfferPush(args: {
  offerId: string;
  senderUserId: string;
  buyerCashTopUpCents: number;
  sellerCashRequestedCents: number;
}): Promise<PushPayload> {
  const senderName = await loadDisplayName(args.senderUserId);
  const cashCents =
    args.buyerCashTopUpCents > 0
      ? args.buyerCashTopUpCents
      : args.sellerCashRequestedCents;
  const cashLabel = `${formatUsdFromCents(cashCents)} cash`;
  const title = `${senderName} updated the cash offer`;
  const body = `${senderName} proposed ${cashLabel}.`;

  return {
    title,
    body,
    data: {
      type: "counter_offer",
      offerId: args.offerId,
      senderName,
      theirItemName: cashLabel,
      valueLabel: `Cash offer: ${formatUsdFromCents(cashCents)}`,
      timestampLabel: "now",
    },
  };
}
