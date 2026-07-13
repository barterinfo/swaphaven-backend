import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer, createCounter } from "./helpers/fixtures.js";
import { MAX_OFFER_ROUNDS } from "../src/lib/max-rounds.js";

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
    expect(Array.isArray(res.body.offeredItems)).toBe(true);
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

  it("buyer gets 409 when accepting the initial offer (not their turn)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Initial offer has currentTurn=seller; buyer accepting is out-of-turn.
    const res = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(409);
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

  it("buyer gets 409 when denying a pending offer (not their turn)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Initial offer: currentTurn = 'seller', so the buyer's deny is out-of-turn.
    const res = await request(app)
      .post(`/api/offers/${offer.id}/deny`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(409);
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

// ─── POST /api/offers/:offerId/counter ────────────────────────────────────────
describe("Counter-offer lifecycle", () => {
  it("seller counters → buyer accepts via /counter/accept → trade created", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const counterRes = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({
        buyerListingIds: [buyerListing.id],
        sellerListingIds: [sellerListing.id],
        sellerCashRequestedCents: 500,
      });

    expect(counterRes.status).toBe(201);
    expect(counterRes.body.roundNumber).toBe(2);
    expect(counterRes.body.proposedBy).toBe("seller");
    expect(counterRes.body.status).toBe("pending");
    expect(counterRes.body.sellerCashRequestedCents).toBe(500);

    const acceptRes = await request(app)
      .post(`/api/offers/${offer.id}/counter/accept`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.id).toBeTruthy();
    expect(acceptRes.body.conversationId).toBeTruthy();
  });

  it("buyer can deny a seller counter via /counter/deny", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id);

    const denyRes = await request(app)
      .post(`/api/offers/${offer.id}/counter/deny`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(denyRes.status).toBe(204);
  });

  it("buyer can counter back after seller counters (bidirectional)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Seller counters first (round 2).
    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id);

    // Buyer counters back (round 3).
    const buyerCounterRes = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        buyerListingIds: [buyerListing.id],
        sellerListingIds: [sellerListing.id],
        buyerCashTopUpCents: 200,
      });

    expect(buyerCounterRes.status).toBe(201);
    expect(buyerCounterRes.body.roundNumber).toBe(3);
    expect(buyerCounterRes.body.proposedBy).toBe("buyer");
  });
});

// ─── GET /api/offers/:offerId — counter-flow fields ───────────────────────────
describe("GET /api/offers/:offerId — counter-flow fields", () => {
  it("fresh offer has currentTurn=seller, roundCount=1, and a latestRound", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.currentTurn).toBe("seller");
    expect(res.body.roundCount).toBe(1);
    expect(res.body.latestRound).not.toBeNull();
    expect(res.body.latestRound.roundNumber).toBe(1);
    expect(res.body.latestRound.proposedBy).toBe("buyer");
  });

  it("updates currentTurn and roundCount after a counter", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id);

    const res = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.currentTurn).toBe("buyer");
    expect(res.body.roundCount).toBe(2);
    expect(res.body.latestRound.roundNumber).toBe(2);
    expect(res.body.latestRound.proposedBy).toBe("seller");
  });
});

// ─── GET /api/offers/:offerId/counter ─────────────────────────────────────────
describe("GET /api/offers/:offerId/counter", () => {
  it("returns the latest pending round after a counter", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id,
      { sellerCashRequestedCents: 300 });

    const res = await request(app)
      .get(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.roundNumber).toBe(2);
    expect(res.body.sellerCashRequestedCents).toBe(300);
    expect(Array.isArray(res.body.buyerItems)).toBe(true);
    expect(Array.isArray(res.body.sellerItems)).toBe(true);
  });

  it("returns 404 when no pending round exists", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Accept immediately — no extra counter round.
    await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .get(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Counter turn enforcement ─────────────────────────────────────────────────
describe("Counter turn enforcement", () => {
  it("buyer cannot counter on the initial offer (seller's turn)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ buyerListingIds: [buyerListing.id], sellerListingIds: [sellerListing.id] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not your turn/i);
  });

  it("seller cannot counter again immediately after their own counter (buyer's turn)", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await createCounter(seller.accessToken, offer.id, buyerListing.id, sellerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ buyerListingIds: [buyerListing.id], sellerListingIds: [sellerListing.id] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/not your turn/i);
  });

  it("third party cannot counter", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const third  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const thirdListing  = await createListing(third.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${third.accessToken}`)
      .send({ buyerListingIds: [buyerListing.id], sellerListingIds: [thirdListing.id] });

    expect(res.status).toBe(403);
  });
});

// ─── Counter listing ownership validation ─────────────────────────────────────
describe("Counter listing ownership validation", () => {
  it("rejects a counter when a buyer listing belongs to the seller", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing  = await createListing(seller.accessToken);
    const sellerListing2 = await createListing(seller.accessToken);
    const buyerListing   = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Seller counters but puts their own listing on the buyer side — invalid.
    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({
        buyerListingIds: [sellerListing2.id],
        sellerListingIds: [sellerListing.id],
      });

    expect(res.status).toBe(400);
  });
});

// ─── Counter round cap ────────────────────────────────────────────────────────
describe("Counter round cap", () => {
  it(`blocks a counter once MAX_OFFER_ROUNDS (${MAX_OFFER_ROUNDS}) is reached`, async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // Round 1 = original offer. Alternate turns to exhaust the cap.
    // Tokens in order of who acts: seller, buyer, seller, buyer, seller
    // → rounds 2 → 3 → 4 → 5 → 6 (= MAX_OFFER_ROUNDS).
    const tokens = [
      seller.accessToken, buyer.accessToken,
      seller.accessToken, buyer.accessToken,
      seller.accessToken,
    ];
    for (const token of tokens) {
      await createCounter(token, offer.id, buyerListing.id, sellerListing.id);
    }

    // roundCount is now MAX_OFFER_ROUNDS; buyer's next counter must be blocked.
    const res = await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ buyerListingIds: [buyerListing.id], sellerListingIds: [sellerListing.id] });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/maximum/i);
  });
});
