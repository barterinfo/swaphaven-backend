import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import {
  registerUser,
  createListing,
  createGiveaway,
} from "./helpers/fixtures.js";

describe("Dedicated giveaway APIs", () => {
  it("POST /api/giveaways forces zero value and empty wants", async () => {
    const { accessToken } = await registerUser();
    const listing = await createGiveaway(accessToken, {
      title: "Free lamp",
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

  it("barter create rejects isGiveaway and points at /api/giveaways", async () => {
    const { accessToken } = await registerUser();
    await expect(
      createListing(accessToken, { isGiveaway: true }),
    ).rejects.toThrow(/createListing failed/);
  });

  it("accepts interest via POST /api/giveaways/:id/interest", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createGiveaway(seller.accessToken, {
      title: "Free lamp",
    });

    const res = await request(app)
      .post(`/api/giveaways/${listing.id}/interest`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ buyerNote: "I can pick up tonight" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });

  it("barter POST /api/offers rejects giveaway targets", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createGiveaway(seller.accessToken);
    const buyerItem = await createListing(buyer.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: listing.id,
        offeredListingIds: [buyerItem.id],
      });
    expect(res.status).toBe(409);
  });

  it("barter POST /api/offers still requires items and does not close giveaways", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const barterListing = await createListing(seller.accessToken);
    const freeListing = await createGiveaway(seller.accessToken);

    const empty = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: barterListing.id, offeredListingIds: [] });
    expect(empty.status).toBe(400);

    const interest = await request(app)
      .post(`/api/giveaways/${freeListing.id}/interest`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({});
    expect(interest.status).toBe(201);

    // Barter accept path must not be used for giveaway interests.
    const wrongAccept = await request(app)
      .post(`/api/offers/${interest.body.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(wrongAccept.status).toBe(409);

    const listingRes = await request(app)
      .get(`/api/listings/${freeListing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const body = listingRes.body.listing ?? listingRes.body;
    expect(body.status).toBe("active");
  });

  it("rejects cash-offers and barter counters on a giveaway", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createGiveaway(seller.accessToken);

    const cash = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 1000 });
    expect(cash.status).toBe(409);

    const interest = await request(app)
      .post(`/api/giveaways/${listing.id}/interest`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({});
    expect(interest.status).toBe(201);

    const counter = await request(app)
      .post(`/api/offers/${interest.body.id}/counter`)
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
    const listing = await createGiveaway(seller.accessToken, {
      title: "Free chair",
    });

    const offerA = await request(app)
      .post(`/api/giveaways/${listing.id}/interest`)
      .set("Authorization", `Bearer ${buyerA.accessToken}`)
      .send({});
    const offerB = await request(app)
      .post(`/api/giveaways/${listing.id}/interest`)
      .set("Authorization", `Bearer ${buyerB.accessToken}`)
      .send({});
    expect(offerA.status).toBe(201);
    expect(offerB.status).toBe(201);

    const accept = await request(app)
      .post(`/api/giveaways/interests/${offerA.body.id}/accept`)
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
    const free = await createGiveaway(seller.accessToken, {
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
