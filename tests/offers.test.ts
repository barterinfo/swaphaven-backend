import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer } from "./helpers/fixtures.js";

// ─── POST /api/offers ─────────────────────────────────────────────────────────
describe("POST /api/offers", () => {
  it("buyer creates an offer on a seller's listing", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, offeredListingIds: [buyerListing.id] });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe("pending");
    expect(res.body.buyerId).toBe(buyer.user.id);
    expect(res.body.sellerId).toBe(seller.user.id);
  });

  it("prevents seller from making an offer on their own listing", async () => {
    const seller = await registerUser();
    const sellerListing  = await createListing(seller.accessToken);
    const sellerListing2 = await createListing(seller.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ listingId: sellerListing.id, offeredListingIds: [sellerListing2.id] });

    expect(res.status).toBe(400);
  });

  it("requires at least one offered listing", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, offeredListingIds: [] });

    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent listing", async () => {
    const buyer = await registerUser();
    const buyerListing = await createListing(buyer.accessToken);

    const res = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: "00000000-0000-0000-0000-000000000000",
        offeredListingIds: [buyerListing.id],
      });

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/offers")
      .send({ listingId: "fake", offeredListingIds: ["fake"] });
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/offers/received ─────────────────────────────────────────────────
describe("GET /api/offers/received", () => {
  it("returns offers where the user is the seller", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get("/api/offers/received")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].sellerId).toBe(seller.user.id);
  });

  it("enriches rows with listing, buyer, seller and offeredItems for the inbox", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get("/api/offers/received")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const offer = res.body.items[0];
    expect(offer.listing.id).toBe(sellerListing.id);
    expect(offer.listing).toHaveProperty("estimatedValueCents");
    expect(offer.buyer.id).toBe(buyer.user.id);
    expect(offer.buyer).not.toHaveProperty("passwordHash");
    expect(offer.seller.id).toBe(seller.user.id);
    expect(offer.offeredItems[0].listing.id).toBe(buyerListing.id);
  });

  it("returns empty for a user with no received offers", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/offers/received")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});

// ─── GET /api/offers/sent ─────────────────────────────────────────────────────
describe("GET /api/offers/sent", () => {
  it("returns offers made by the authenticated user", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get("/api/offers/sent")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].buyerId).toBe(buyer.user.id);
  });
});

// ─── GET /api/offers/:offerId ─────────────────────────────────────────────────
describe("GET /api/offers/:offerId", () => {
  it("seller can view the offer detail", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(offer.id);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("third party receives 403", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const third  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /api/offers/:offerId/accept ─────────────────────────────────────────
describe("POST /api/offers/:offerId/accept", () => {
  it("seller accepts offer — trade and conversation are created", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();        // trade id
    expect(res.body.offerId).toBe(offer.id);
    expect(res.body.conversationId).toBeTruthy();
  });

  it("buyer cannot accept their own offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("cannot accept an already-accepted offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(409);
  });
});

// ─── POST /api/offers/:offerId/deny ───────────────────────────────────────────
describe("POST /api/offers/:offerId/deny", () => {
  it("seller can deny a pending offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/deny`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(204);
  });

  it("buyer cannot deny (they withdraw instead)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/deny`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /api/offers/:offerId/withdraw ───────────────────────────────────────
describe("POST /api/offers/:offerId/withdraw", () => {
  it("buyer can withdraw their pending offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/withdraw`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(204);
  });

  it("seller cannot withdraw the buyer's offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/withdraw`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /api/offers/:offerId/counter (full counter-offer lifecycle) ──────────
describe("Counter-offer lifecycle", () => {
  it("seller counters → buyer accepts → trade created", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Seller needs the offer items to reference in the counter
    const offerDetail = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const offerItemId = offerDetail.body.items[0].id;

    // Step 1: Seller counters
    const counterRes = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ includedOfferItemIds: [offerItemId], cashRequestedCents: 500 });

    expect(counterRes.status).toBe(201);
    expect(counterRes.body.status).toBe("pending");

    // Step 2: Buyer accepts the counter
    const acceptRes = await request(app)
      .post(`/api/offers/${offer.id}/counter/accept`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.id).toBeTruthy();        // trade id
    expect(acceptRes.body.conversationId).toBeTruthy();
  });

  it("buyer can deny a counter-offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const offerDetail = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const offerItemId = offerDetail.body.items[0].id;

    await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ includedOfferItemIds: [offerItemId] });

    const denyRes = await request(app)
      .post(`/api/offers/${offer.id}/counter/deny`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(denyRes.status).toBe(204);
  });
});
