import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer } from "./helpers/fixtures.js";
describe("GET /api/swipe/deck", () => {
  it("returns active listings not owned by the user", async () => {
    const { accessToken: userToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();

    await createListing(otherToken);
    await createListing(otherToken);
    await createListing(userToken); // own listing — must not appear in deck

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(res.body.cards).toHaveLength(2);
    expect(typeof res.body.remainingSwipesToday).toBe("number");
    for (const card of res.body.cards) {
      expect(typeof card.listing.ownerName).toBe("string");
      expect(card.listing.ownerName.length).toBeGreaterThan(0);
      expect(card.listing.user).toBeUndefined();
    }
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/swipe/deck");
    expect(res.status).toBe(401);
  });

  it("hides a listing from the buyer who already has an active offer on it", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    // buyer makes an offer on seller's listing
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    // buyer's own deck must NOT include the listing they already offered on
    const buyerRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(buyerRes.status).toBe(200);
    const buyerCardIds = buyerRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(buyerCardIds).not.toContain(sellerListing.id);
  });

  it("hides the buyer's listing from the seller when they have received an active offer", async () => {
    // User Y (buyer) swipes right on X's product and offers their Aircon.
    // User X (seller) has received the offer → X must not see Aircon in their deck.
    const userX = await registerUser(); // seller
    const userY = await registerUser(); // buyer

    const xProduct = await createListing(userX.accessToken);
    const aircon   = await createListing(userY.accessToken); // Y's item being offered

    // Y offers their Aircon in exchange for X's product
    await createOffer(userY.accessToken, xProduct.id, aircon.id);

    const xDeckRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${userX.accessToken}`);

    expect(xDeckRes.status).toBe(200);
    const xCardIds = xDeckRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    // X received an offer where Aircon is the offered item → must be hidden from X's deck
    expect(xCardIds).not.toContain(aircon.id);
  });

  it("still shows an offered listing to other users who have no offer on it", async () => {
    const seller  = await registerUser();
    const buyer   = await registerUser();
    const swiper  = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    // buyer has an offer — but swiper does not
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const swiperRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${swiper.accessToken}`);

    expect(swiperRes.status).toBe(200);
    const swiperCardIds = swiperRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    // swiper has no offer on sellerListing → it must still appear
    expect(swiperCardIds).toContain(sellerListing.id);
  });

  it("returns empty deck when no other listings exist", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken);

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.cards).toHaveLength(0);
  });

  it("shows a listing again in the buyer deck after the offer is withdrawn", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const hiddenRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    const hiddenIds = hiddenRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(hiddenIds).not.toContain(sellerListing.id);

    await request(app)
      .post(`/api/offers/${offer.id}/withdraw`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .expect(204);

    const restoredRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    const restoredIds = restoredRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(restoredIds).toContain(sellerListing.id);
  });

  it("shows counter-excluded offer items in the seller deck after a counter", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const includedItem = await createListing(buyer.accessToken);
    const excludedItem = await createListing(buyer.accessToken);

    const offerRes = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: sellerListing.id,
        offeredListingIds: [includedItem.id, excludedItem.id],
      });
    expect(offerRes.status).toBe(201);

    const offerDetail = await request(app)
      .get(`/api/offers/${offerRes.body.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const includedOfferItemId = offerDetail.body.offeredItems.find(
      (item: { listing: { id: string } }) => item.listing.id === includedItem.id,
    ).id;

    await request(app)
      .post(`/api/offers/${offerRes.body.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ includedOfferItemIds: [includedOfferItemId] })
      .expect(201);

    const deckRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const cardIds = deckRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(cardIds).not.toContain(includedItem.id);
    expect(cardIds).toContain(excludedItem.id);
  });
});

// ─── POST /api/swipe ──────────────────────────────────────────────────────────
describe("POST /api/swipe", () => {
  it("records a right swipe on another user's listing", async () => {
    const { accessToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();
    const listing = await createListing(otherToken);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    expect(res.status).toBe(201);
    expect(res.body.direction).toBe("right");

    const detailRes = await request(app).get(`/api/listings/${listing.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.listing.right_swipe_count).toBe(1);

    const viewer = await registerUser();
    const deckRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    const card = deckRes.body.cards.find(
      (c: { listing: { id: string } }) => c.listing.id === listing.id,
    );
    expect(card).toBeTruthy();
    expect(card.hotCount).toBe(1);
    expect(card.listing.rightSwipeCount).toBe(1);
  });

  it("records a left swipe", async () => {
    const { accessToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();
    const listing = await createListing(otherToken);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: listing.id, direction: "left" });

    expect(res.status).toBe(201);
    expect(res.body.direction).toBe("left");
  });

  it("prevents swiping on own listing", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    expect(res.status).toBe(400);
  });

  it("returns 409 when swiping a listing in an active offer negotiation", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, direction: "right" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/active offer/i);
  });

  it("is idempotent — duplicate swipes do not crash", async () => {
    const { accessToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();
    const listing = await createListing(otherToken);
    const payload = { listingId: listing.id, direction: "right" };

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect([200, 201, 204, 409]).toContain(res.status);
  });
});

// ─── GET /api/swipe/streak ────────────────────────────────────────────────────
describe("GET /api/swipe/streak", () => {
  it("returns streak data for authenticated user", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/swipe/streak")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Streak object should include a count or days field
    expect(typeof res.body).toBe("object");
  });
});
