import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";

describe("Giveaway listings", () => {
  it("normalizes value, cash, and wants when isGiveaway is true", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken, {
      isGiveaway: true,
      estimatedValueCents: 5000,
      acceptCashTopUps: true,
      wantedCategories: ["Electronics"],
      wantedFreeText: "cameras",
    });

    const res = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const body = res.body.listing ?? res.body;
    expect(body.is_giveaway ?? body.isGiveaway).toBe(true);
    expect(body.estimatedValueCents ?? body.estimated_value_cents).toBe(0);
    expect(body.accept_cash_top_ups ?? body.acceptCashTopUps).toBe(false);
    expect(body.wanted_categories ?? body.wantedCategories ?? []).toEqual([]);
  });

  it("accepts an empty interest offer on a giveaway", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken, {
      isGiveaway: true,
      title: "Free lamp",
    });

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: listing.id,
        offeredListingIds: [],
        cashTopUpCents: 0,
        buyerNote: "I can pick up tonight",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });

  it("rejects items or cash on a giveaway interest", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken, { isGiveaway: true });
    const buyerItem = await createListing(buyer.accessToken);

    const withItems = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: listing.id,
        offeredListingIds: [buyerItem.id],
      });
    expect(withItems.status).toBe(400);

    const withCash = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: listing.id,
        offeredListingIds: [],
        cashTopUpCents: 500,
      });
    expect(withCash.status).toBe(400);
  });

  it("rejects cash-offers and counters on a giveaway", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken, { isGiveaway: true });

    const cash = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 1000 });
    expect(cash.status).toBe(409);

    const offerRes = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, offeredListingIds: [] });
    expect(offerRes.status).toBe(201);

    const counter = await request(app)
      .post(`/api/offers/${offerRes.body.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({
        buyerListingIds: [listing.id],
        sellerListingIds: [listing.id],
      });
    expect(counter.status).toBe(409);
  });

  it("accept closes the listing and declines other interests", async () => {
    const seller = await registerUser();
    const buyerA = await registerUser();
    const buyerB = await registerUser();
    const listing = await createListing(seller.accessToken, {
      isGiveaway: true,
      title: "Free chair",
    });

    const offerA = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyerA.accessToken}`)
      .send({ listingId: listing.id, offeredListingIds: [] });
    const offerB = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyerB.accessToken}`)
      .send({ listingId: listing.id, offeredListingIds: [] });
    expect(offerA.status).toBe(201);
    expect(offerB.status).toBe(201);

    const accept = await request(app)
      .post(`/api/offers/${offerA.body.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(accept.status).toBe(200);

    const listingRes = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const body = listingRes.body.listing ?? listingRes.body;
    expect(body.status).toBe("traded");

    const other = await request(app)
      .get(`/api/offers/${offerB.body.id}`)
      .set("Authorization", `Bearer ${buyerB.accessToken}`);
    expect(other.status).toBe(200);
    expect(other.body.status).toBe("denied");
  });

  it("deck giveaway=true returns only free listings", async () => {
    const seller = await registerUser();
    const viewer = await registerUser();
    await createListing(seller.accessToken, { title: "Barter bike" });
    const free = await createListing(seller.accessToken, {
      isGiveaway: true,
      title: "Free mug",
    });

    const deck = await request(app)
      .get("/api/swipe/deck")
      .query({ giveaway: "true" })
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(deck.status).toBe(200);
    const cards = deck.body.cards as Array<{
      listing?: { id?: string; isGiveaway?: boolean; is_giveaway?: boolean };
    }>;
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const listing = card.listing!;
      expect(listing.isGiveaway ?? listing.is_giveaway).toBe(true);
    }
    expect(cards.some((c) => c.listing?.id === free.id)).toBe(true);
  });
});

