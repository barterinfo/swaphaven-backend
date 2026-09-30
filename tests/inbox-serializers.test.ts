import { describe, expect, it } from "vitest";
import { serializeOfferListItem, serializeOfferRound } from "../src/lib/inbox-serializers.js";

const listingWithImages = {
  id: "listing-1",
  title: "Jacket",
  estimatedValueCents: 5000,
  status: "active",
  images: [
    { url: "https://cdn.example/a.jpg" },
    { url: "https://cdn.example/b.jpg" },
    { url: "https://cdn.example/c.jpg" },
  ],
};

describe("inbox serializers image capping", () => {
  it("list offer rows keep only the first image by default", () => {
    const row = serializeOfferListItem({
      id: "offer-1",
      status: "pending",
      buyerId: "buyer-1",
      sellerId: "seller-1",
      listingId: "listing-1",
      cashTopUpCents: 0,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      listing: listingWithImages,
      items: [{ listing: listingWithImages }],
    });
    expect(row.listing?.images).toEqual([{ url: "https://cdn.example/a.jpg" }]);
    expect(row.offeredItems[0]?.listing?.images).toHaveLength(1);
  });

  it("detail can request all images", () => {
    const row = serializeOfferListItem(
      {
        id: "offer-1",
        status: "pending",
        buyerId: "buyer-1",
        sellerId: "seller-1",
        listingId: "listing-1",
        cashTopUpCents: 0,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        listing: listingWithImages,
        items: [],
      },
      { maxImages: Number.POSITIVE_INFINITY },
    );
    expect(row.listing?.images).toHaveLength(3);
  });

  it("round summaries default to one image per item", () => {
    const round = serializeOfferRound({
      id: "round-1",
      roundNumber: 1,
      proposedBy: "buyer",
      buyerCashTopUpCents: 0,
      sellerCashRequestedCents: 0,
      status: "pending",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      items: [
        { side: "buyer", position: 0, listing: listingWithImages },
        { side: "seller", position: 0, listing: listingWithImages },
      ],
    });
    expect(round.buyerItems[0]?.images).toHaveLength(1);
    expect(round.sellerItems[0]?.images).toHaveLength(1);
  });
});
