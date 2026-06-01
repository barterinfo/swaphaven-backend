import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import {
  registerUser, createListing, createOffer, fullTradeSetup,
} from "./helpers/fixtures.js";

// ─── GET /api/inbox/summary ───────────────────────────────────────────────────
describe("GET /api/inbox/summary", () => {
  it("returns zeroes for a fresh user", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ actionNeededOffers: 0, unreadMessages: 0, total: 0 });
  });

  it("counts received pending offers as action needed", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const sellerRes = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(sellerRes.body.actionNeededOffers).toBe(1);
    expect(sellerRes.body.total).toBe(1);

    // The buyer sent the offer → nothing actionable on their side.
    const buyerRes = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerRes.body.actionNeededOffers).toBe(0);
  });

  it("counts countered offers for the buyer only, not the seller", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const offerDetail = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const offerItemId = offerDetail.body.offeredItems[0].id;

    await request(app)
      .post(`/api/offers/${offer.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ includedOfferItemIds: [offerItemId] });

    const sellerRes = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(sellerRes.body.actionNeededOffers).toBe(0);

    const buyerRes = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerRes.body.actionNeededOffers).toBe(1);
    expect(buyerRes.body.total).toBe(1);
  });

  it("drops unreadMessages in summary after PATCH read", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const convId = trade.conversationId;

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "Ping" });

    const before = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(before.body.unreadMessages).toBe(1);

    await request(app)
      .patch(`/api/conversations/${convId}/read`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const after = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(after.body.unreadMessages).toBe(0);
    expect(after.body.total).toBe(0);
  });

  it("counts unread messages from the other participant", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "When can we meet?" });

    const res = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(res.body.unreadMessages).toBe(1);
    expect(res.body.total).toBe(1);

    // Sender does not see their own message as unread.
    const buyerRes = await request(app)
      .get("/api/inbox/summary")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(buyerRes.body.unreadMessages).toBe(0);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/inbox/summary");
    expect(res.status).toBe(401);
  });
});
