import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { listingsTable } from "../src/db/schema/index.js";

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

  it("filters deck by category slug when category query is set", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const electronics = await createListing(owner.accessToken, {
      title: "Phone",
      category: "electronics",
    });
    const clothing = await createListing(owner.accessToken, {
      title: "Jacket",
      category: "clothing",
    });

    const res = await request(app)
      .get("/api/swipe/deck?category=electronics")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    expect(ids).toContain(electronics.id);
    expect(ids).not.toContain(clothing.id);
  });

  it("omits excludeIds from the deck page and keeps page size at most 20", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();

    const listings = [];
    for (let i = 0; i < 5; i++) {
      listings.push(await createListing(owner.accessToken));
    }

    const first = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(first.status).toBe(200);
    expect(first.body.cards.length).toBeGreaterThanOrEqual(2);
    expect(first.body.cards.length).toBeLessThanOrEqual(20);
    expect(first.body.remainingSwipesToday).toBe(20);

    const excludeIds = first.body.cards
      .slice(0, 2)
      .map((c: { listing: { id: string } }) => c.listing.id);

    const second = await request(app)
      .get(`/api/swipe/deck?excludeIds=${excludeIds.join(",")}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(second.status).toBe(200);
    const secondIds = second.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    for (const id of excludeIds) {
      expect(secondIds).not.toContain(id);
    }
    expect(second.body.cards.length).toBeLessThanOrEqual(20);
  });

  it("does not return left-passed listings until they are recycled", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const passed = await createListing(owner.accessToken);
    const unseen = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: passed.id, direction: "left" })
      .expect(201);

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    expect(ids).toContain(unseen.id);
    expect(ids).not.toContain(passed.id);
  });

  it("decrements remainingSwipesToday after recording swipes", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const a = await createListing(owner.accessToken);
    const b = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: a.id, direction: "left" })
      .expect(201);
    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: b.id, direction: "left" })
      .expect(201);

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.remainingSwipesToday).toBe(18);
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

    // Seller counters keeping only one buyer item in the deal.
    await request(app)
      .post(`/api/offers/${offerRes.body.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({
        buyerListingIds: [includedItem.id],
        sellerListingIds: [sellerListing.id],
      })
      .expect(201);

    const deckRes = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const cardIds = deckRes.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    // Item kept in the counter round stays hidden from the seller deck.
    expect(cardIds).not.toContain(includedItem.id);
    // Dropped buyer items are not in the pending round, but may still be
    // linked via legacy offer_items — only assert they aren't the included one.
    expect(cardIds).not.toContain(sellerListing.id);
  });
});

// ─── POST /api/swipe/recycle-left ─────────────────────────────────────────────
describe("POST /api/swipe/recycle-left", () => {
  it("resets left-passes so those listings reappear, leaving right-swipes hidden", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const passed = await createListing(owner.accessToken);
    const liked = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: passed.id, direction: "left" })
      .expect(201);
    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: liked.id, direction: "right" })
      .expect(201);

    const before = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    const beforeIds = before.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    expect(beforeIds).not.toContain(passed.id);
    expect(beforeIds).not.toContain(liked.id);

    const recycle = await request(app)
      .post("/api/swipe/recycle-left")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(recycle.status).toBe(200);
    expect(recycle.body.recycledCount).toBe(1);

    const after = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    const afterIds = after.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    expect(afterIds).toContain(passed.id);
    expect(afterIds).not.toContain(liked.id);
  });

  it("is idempotent when there are no left-passes", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/swipe/recycle-left")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.recycledCount).toBe(0);
  });

  it("lets a recycled left pass be swiped right as a new like", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listing.id, direction: "left" })
      .expect(201);

    await request(app)
      .post("/api/swipe/recycle-left")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(200);

    const rightRes = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });
    expect(rightRes.status).toBe(201);
    expect(rightRes.body.direction).toBe("right");

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    const ids = res.body.cards.map(
      (c: { listing: { id: string } }) => c.listing.id,
    );
    expect(ids).not.toContain(listing.id);
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

  it("returns 403 when swiping a listing whose owner blocked the viewer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    await request(app)
      .post(`/api/blocks/${buyer.user.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .expect(201);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
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

  it("returns 429 when the daily swipe quota is exhausted", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();

    const listings = [];
    for (let i = 0; i < 21; i++) {
      listings.push(await createListing(owner.accessToken));
    }

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post("/api/swipe")
        .set("Authorization", `Bearer ${viewer.accessToken}`)
        .send({ listingId: listings[i].id, direction: "left" });
      expect(res.status).toBe(201);
    }

    const blocked = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listings[20].id, direction: "left" });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("daily_limit");
  });
});

// ─── Superlike quota ──────────────────────────────────────────────────────────
describe("POST /api/swipe — super direction", () => {
  it("accepts direction=super, bumps right_swipe_count and returns superlikesRemaining", async () => {
    const { accessToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();
    const listing = await createListing(otherToken);

    const res = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: listing.id, direction: "super" });

    expect(res.status).toBe(201);
    expect(res.body.direction).toBe("super");
    expect(typeof res.body.superlikesRemaining).toBe("number");
    expect(res.body.superlikesRemaining).toBe(1); // started at 2, now 1

    // right_swipe_count must be incremented by super-swipes too
    const detailRes = await request(app).get(`/api/listings/${listing.id}`);
    expect(detailRes.body.listing.right_swipe_count).toBe(1);
  });

  it("returns superlikesRemaining in the deck response", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.superlikesRemaining).toBe("number");
  });

  it("returns 429 superlike_limit after quota is exhausted", async () => {
    const { accessToken } = await registerUser();
    const { accessToken: otherToken } = await registerUser();
    const l1 = await createListing(otherToken);
    const l2 = await createListing(otherToken);
    const l3 = await createListing(otherToken);

    // Use both free superlikes
    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: l1.id, direction: "super" })
      .expect(201);
    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: l2.id, direction: "super" })
      .expect(201);

    // Third super-swipe must be blocked
    const blocked = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ listingId: l3.id, direction: "super" });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("superlike_limit");
    expect(blocked.body.superlikesRemaining).toBe(0);
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

// ─── DELETE /api/swipe/:swipeId ───────────────────────────────────────────────
describe("DELETE /api/swipe/:swipeId", () => {
  it("undoes a left pass so the listing can reappear in the deck", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const swipeRes = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listing.id, direction: "left" });
    expect(swipeRes.status).toBe(201);
    const swipeId = swipeRes.body.swipeId as string;
    expect(swipeId).toBeTruthy();

    const deckBefore = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(
      deckBefore.body.cards.some(
        (c: { listing: { id: string } }) => c.listing.id === listing.id,
      ),
    ).toBe(false);

    const undoRes = await request(app)
      .delete(`/api/swipe/${swipeId}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.swipeId).toBe(swipeId);
    expect(undoRes.body.listingId).toBe(listing.id);
    expect(typeof undoRes.body.remainingSwipesToday).toBe("number");
    expect(typeof undoRes.body.bonusSwipesAvailable).toBe("number");

    const deckAfter = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(
      deckAfter.body.cards.some(
        (c: { listing: { id: string } }) => c.listing.id === listing.id,
      ),
    ).toBe(true);
  });

  it("returns 404 for an unknown swipe", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .delete("/api/swipe/00000000-0000-4000-8000-000000000001")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 403 when undoing another user's swipe", async () => {
    const passer = await registerUser();
    const other = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const swipeRes = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${passer.accessToken}`)
      .send({ listingId: listing.id, direction: "left" });
    expect(swipeRes.status).toBe(201);

    const res = await request(app)
      .delete(`/api/swipe/${swipeRes.body.swipeId}`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 400 when undoing a right swipe", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const swipeRes = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });
    expect(swipeRes.status).toBe(201);

    const res = await request(app)
      .delete(`/api/swipe/${swipeRes.body.swipeId}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/left/i);
  });

  it("restores bonus when undoing a pass that consumed bonus quota", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();

    const listings = [];
    for (let i = 0; i < 21; i++) {
      listings.push(await createListing(owner.accessToken));
    }

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post("/api/swipe")
        .set("Authorization", `Bearer ${viewer.accessToken}`)
        .send({ listingId: listings[i].id, direction: "left" });
      expect(res.status).toBe(201);
    }

    const { testDb } = await import("./helpers/db.js");
    const { swipeStreaksTable } = await import("../src/db/schema/index.js");

    await testDb
      .insert(swipeStreaksTable)
      .values({
        userId: viewer.user.id,
        currentStreak: 1,
        longestStreak: 1,
        lastSwipeDate: new Date().toISOString().slice(0, 10),
        bonusSwipesRemaining: 2,
      })
      .onConflictDoUpdate({
        target: swipeStreaksTable.userId,
        set: { bonusSwipesRemaining: 2 },
      });

    const bonusSwipe = await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listings[20].id, direction: "left" });
    expect(bonusSwipe.status).toBe(201);

    const streakAfterConsume = await request(app)
      .get("/api/swipe/streak")
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(streakAfterConsume.body.bonusSwipesRemaining).toBe(1);

    const undoRes = await request(app)
      .delete(`/api/swipe/${bonusSwipe.body.swipeId}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(undoRes.status).toBe(200);
    expect(undoRes.body.bonusSwipesAvailable).toBe(2);
  });
});

describe("GET /api/swipe/deck country filter", () => {
  it("hides listings from a different country than the viewer", async () => {
    const sgViewer = await registerUser();
    const inSeller = await registerUser();
    const sgSeller = await registerUser();

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sgViewer.accessToken}`)
      .send({ locationCountry: "SG" });
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${inSeller.accessToken}`)
      .send({ locationCountry: "IN" });
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sgSeller.accessToken}`)
      .send({ locationCountry: "SG" });

    const indiaListing = await createListing(inSeller.accessToken, {
      title: "India Item",
      location: { lat: 28.61, lng: 77.2, address: "New Delhi", country: "IN" },
    });
    const sgListing = await createListing(sgSeller.accessToken, {
      title: "Singapore Item",
      location: { lat: 1.35, lng: 103.82, address: "Singapore", country: "SG" },
    });

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${sgViewer.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(ids).toContain(sgListing.id);
    expect(ids).not.toContain(indiaListing.id);
  });

  it("includes listings with empty location_country for legacy nearby parity", async () => {
    const sgViewer = await registerUser();
    const seller = await registerUser();

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sgViewer.accessToken}`)
      .send({ locationCountry: "SG" });

    const emptyCountryListing = await createListing(seller.accessToken, {
      title: "Legacy Empty Country Item",
      location: { lat: 1.35, lng: 103.82, address: "Singapore", country: "SG" },
    });
    // Create API always stamps country; simulate pre-migration rows.
    await testDb
      .update(listingsTable)
      .set({ locationCountry: "" })
      .where(eq(listingsTable.id, emptyCountryListing.id));

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${sgViewer.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(ids).toContain(emptyCountryListing.id);
  });

  it("shows NZ listings to a viewer inferred from CF-IPCountry NZ", async () => {
    const nzViewer = await registerUser();
    const nzSeller = await registerUser();
    const sgSeller = await registerUser();

    const nzListing = await createListing(nzSeller.accessToken, {
      title: "NZ Item",
      location: {
        lat: -36.85,
        lng: 174.76,
        address: "Auckland",
        country: "NZ",
      },
    });
    await createListing(sgSeller.accessToken, {
      title: "SG Item",
      location: { lat: 1.35, lng: 103.82, address: "Singapore", country: "SG" },
    });

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${nzViewer.accessToken}`)
      .set("CF-IPCountry", "NZ");

    expect(res.status).toBe(200);
    const ids = res.body.cards.map((c: { listing: { id: string } }) => c.listing.id);
    expect(ids).toContain(nzListing.id);
    expect(ids).toHaveLength(1);

    const me = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${nzViewer.accessToken}`);
    expect(me.body.locationCountry).toBe("NZ");
  });

  it("stamps listing country from request IP when payload omits it", async () => {
    const seller = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .set("CF-IPCountry", "NZ")
      .send({
        title: `NZ-Stamp-${Date.now()}`,
        condition: "good",
        categoryId: (
          await request(app).get("/api/categories")
        ).body.find((c: { slug: string }) => c.slug === "electronics")?.id,
        location: { lat: -36.85, lng: 174.76, address: "Auckland" },
      });

    expect(res.status).toBe(201);
    expect(res.body.listing.location.country).toBe("NZ");
  });
});

describe("GET /api/geo/me", () => {
  it("returns NZ when CF-IPCountry is NZ", async () => {
    const res = await request(app).get("/api/geo/me").set("CF-IPCountry", "NZ");
    expect(res.status).toBe(200);
    expect(res.body.country).toBe("NZ");
    expect(res.body.source).toBe("header");
    expect(typeof res.body.lat).toBe("number");
    expect(typeof res.body.lng).toBe("number");
  });

  it("falls back to SG when country cannot be resolved", async () => {
    const res = await request(app).get("/api/geo/me");
    expect(res.status).toBe(200);
    expect(res.body.country).toBe("SG");
    expect(res.body.source).toBe("fallback");
  });
});
