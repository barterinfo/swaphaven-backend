import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, fullTradeSetup } from "./helpers/fixtures.js";

// ─── GET /api/trades ──────────────────────────────────────────────────────────
describe("GET /api/trades", () => {
  it("returns trades for the authenticated user", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    const sellerRes = await request(app)
      .get("/api/trades")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(sellerRes.status).toBe(200);
    expect(sellerRes.body.items).toHaveLength(1);
    expect(sellerRes.body.items[0].id).toBe(trade.id);

    const buyerRes = await request(app)
      .get("/api/trades")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(buyerRes.status).toBe(200);
    expect(buyerRes.body.items).toHaveLength(1);
  });

  it("returns empty list for user with no trades", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/trades")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/trades");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/trades/:tradeId ─────────────────────────────────────────────────
describe("GET /api/trades/:tradeId", () => {
  it("returns trade detail with offer and items", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .get(`/api/trades/${trade.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(trade.id);
    expect(res.body.offer).toBeDefined();
    expect(Array.isArray(res.body.reviews)).toBe(true);
  });

  it("third party receives 403", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .get(`/api/trades/${trade.id}`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent trade", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .get("/api/trades/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/trades/:tradeId/meetup ────────────────────────────────────────
describe("PATCH /api/trades/:tradeId/meetup", () => {
  it("participant can set meetup and it appears in conversations", async () => {
    const { seller, trade } = await fullTradeSetup();
    const meetupAt = "2026-06-15T14:00:00.000Z";

    const patchRes = await request(app)
      .patch(`/api/trades/${trade.id}/meetup`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ meetupScheduledAt: meetupAt, meetupLocation: "Central Park" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.meetupScheduledAt).toBeTruthy();
    expect(patchRes.body.meetupLocation).toBe("Central Park");

    const listRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(listRes.body.items[0].trade.meetupScheduledAt).toBeTruthy();
    expect(listRes.body.items[0].trade.meetupLocation).toBe("Central Park");
  });

  it("third party cannot set meetup", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .patch(`/api/trades/${trade.id}/meetup`)
      .set("Authorization", `Bearer ${third.accessToken}`)
      .send({ meetupScheduledAt: "2026-06-15T14:00:00.000Z", meetupLocation: "Nowhere" });

    expect(res.status).toBe(403);
  });
});

// ─── POST /api/trades/:tradeId/complete ───────────────────────────────────────
describe("POST /api/trades/:tradeId/complete", () => {
  it("participant can mark a trade as completed", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(res.body.completedAt).toBeTruthy();
  });

  it("cannot complete an already-completed trade", async () => {
    const { seller, trade } = await fullTradeSetup();

    await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(409);
  });

  it("third party cannot complete the trade", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── POST /api/trades/:tradeId/reviews ────────────────────────────────────────
describe("POST /api/trades/:tradeId/reviews", () => {
  it("participant can leave a review after completion", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    // Complete the trade first
    await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 5, comment: "Great swap!" });

    expect(res.status).toBe(201);
    expect(res.body.rating).toBe(5);
    expect(res.body.reviewerId).toBe(buyer.user.id);
  });

  it("cannot leave a review before trade is completed", async () => {
    const { buyer, trade } = await fullTradeSetup();

    const res = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 4 });

    expect(res.status).toBe(409);
  });

  it("cannot leave a duplicate review", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 5 });

    const res = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 3 });

    expect(res.status).toBe(409);
  });

  it("validates rating range (1–5)", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 10 });

    expect(res.status).toBe(400);
  });

  it("both parties can independently leave reviews", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    await request(app)
      .post(`/api/trades/${trade.id}/complete`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const r1 = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ rating: 5 });

    const r2 = await request(app)
      .post(`/api/trades/${trade.id}/reviews`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ rating: 4, comment: "Smooth transaction" });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });
});
