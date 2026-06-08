import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import {
  registerUser, fullTradeSetup, createListing, createOffer, acceptOffer,
} from "./helpers/fixtures.js";

// Mock Overpass so tests are deterministic and don't hit the public endpoint.
vi.mock("../src/lib/overpass.js", () => ({
  fetchTransitSuggestions: vi.fn().mockResolvedValue([
    { name: "Central Station", lat: 37.765, lng: -122.415, type: "Train Station", distanceMeters: 320 },
    { name: "Market St & 4th Bus Stop", lat: 37.768, lng: -122.403, type: "Bus Stop", distanceMeters: 890 },
  ]),
}));

// ─── GET /api/conversations ───────────────────────────────────────────────────
describe("GET /api/conversations", () => {
  it("returns conversations for both trade participants", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    const sellerRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(sellerRes.status).toBe(200);
    expect(sellerRes.body.items).toHaveLength(1);
    expect(sellerRes.body.items[0].id).toBe(trade.conversationId);

    const buyerRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(buyerRes.status).toBe(200);
    expect(buyerRes.body.items).toHaveLength(1);
  });

  it("returns the caller's thread with limit=1 even when other users have conversations", async () => {
    const { seller, trade } = await fullTradeSetup();
    await fullTradeSetup();

    const res = await request(app)
      .get("/api/conversations?limit=1")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(trade.conversationId);
  });

  it("bubbles a conversation to the top after a new message", async () => {
    const seller = await registerUser();
    const buyerA = await registerUser();
    const buyerB = await registerUser();

    const sellerListing = await createListing(seller.accessToken);
    const listingA = await createListing(buyerA.accessToken);
    const listingB = await createListing(buyerB.accessToken);

    const offerA = await createOffer(buyerA.accessToken, sellerListing.id, listingA.id);
    const tradeA = await acceptOffer(seller.accessToken, offerA.id);

    const offerB = await createOffer(buyerB.accessToken, sellerListing.id, listingB.id);
    const tradeB = await acceptOffer(seller.accessToken, offerB.id);

    await request(app)
      .post(`/api/conversations/${tradeA.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyerA.accessToken}`)
      .send({ body: "Older thread ping" });

    const res = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].id).toBe(tradeA.conversationId);
    expect(res.body.items[0].lastMessage.body).toBe("Older thread ping");
    expect(res.body.items[1].id).toBe(tradeB.conversationId);
  });

  it("returns empty for user with no conversations", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("enriches each row with offer, trade, otherUser and unreadCount", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "Hey! Does it come with the original box?" });

    const res = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    const row = res.body.items[0];
    expect(row.offer).toBeDefined();
    expect(row.offer.status).toBe("accepted");
    expect(row.trade.status).toBe("pending_meetup");
    expect(row.trade).toHaveProperty("meetupScheduledAt");
    expect(row.otherUser.id).toBe(buyer.user.id);
    expect(row.lastMessage.body).toBe("Hey! Does it come with the original box?");
    // The seller has not opened the thread yet → buyer's message is unread.
    expect(row.unreadCount).toBe(1);
  });

  it("never leaks credentials in otherUser", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.body.items[0].otherUser).not.toHaveProperty("passwordHash");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/conversations");
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/conversations/:conversationId/read ────────────────────────────
describe("PATCH /api/conversations/:conversationId/read", () => {
  it("clears the unread count for the reader", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const convId = trade.conversationId;

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "Still interested?" });

    const readRes = await request(app)
      .patch(`/api/conversations/${convId}/read`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(readRes.status).toBe(204);

    const listRes = await request(app)
      .get("/api/conversations")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(listRes.body.items[0].unreadCount).toBe(0);
  });

  it("third party cannot mark read", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();
    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/read`)
      .set("Authorization", `Bearer ${third.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent conversation", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .patch("/api/conversations/00000000-0000-0000-0000-000000000000/read")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { trade } = await fullTradeSetup();
    const res = await request(app).patch(`/api/conversations/${trade.conversationId}/read`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/conversations/:conversationId ───────────────────────────────────
describe("GET /api/conversations/:conversationId", () => {
  it("returns conversation detail", async () => {
    const { seller, trade } = await fullTradeSetup();
    const convId = trade.conversationId;

    const res = await request(app)
      .get(`/api/conversations/${convId}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(convId);
    expect(res.body.offer).toBeDefined();
  });

  it("third party receives 403", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent conversation", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .get("/api/conversations/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── GET /api/conversations/:conversationId/messages ──────────────────────────
describe("GET /api/conversations/:conversationId/messages", () => {
  it("returns empty message list initially", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("third party cannot read messages", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });
});

// ─── GET /api/conversations/:conversationId/meetup-suggestions ────────────────
describe("GET /api/conversations/:conversationId/meetup-suggestions", () => {
  it("returns location_unavailable when neither user has location set", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/meetup-suggestions`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.midpoint).toBeNull();
    expect(res.body.suggestions).toHaveLength(0);
    expect(res.body.reason).toBe("location_unavailable");
  });

  it("returns suggestions when both users have location set", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ locationLat: 37.7749, locationLng: -122.4194 });

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ locationLat: 37.7580, locationLng: -122.4382 });

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/meetup-suggestions`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.midpoint).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions[0]).toHaveProperty("name");
    expect(res.body.suggestions[0]).toHaveProperty("type");
    expect(res.body.suggestions[0]).toHaveProperty("distanceMeters");
  });

  it("buyer can also fetch suggestions", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();

    await Promise.all([
      request(app).patch("/api/users/me").set("Authorization", `Bearer ${seller.accessToken}`).send({ locationLat: 37.7749, locationLng: -122.4194 }),
      request(app).patch("/api/users/me").set("Authorization", `Bearer ${buyer.accessToken}`).send({ locationLat: 37.7580, locationLng: -122.4382 }),
    ]);

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/meetup-suggestions`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
  });

  it("third party receives 403", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/meetup-suggestions`)
      .set("Authorization", `Bearer ${third.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent conversation", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .get("/api/conversations/00000000-0000-0000-0000-000000000000/meetup-suggestions")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const { trade } = await fullTradeSetup();
    const res = await request(app)
      .get(`/api/conversations/${trade.conversationId}/meetup-suggestions`);
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/conversations/:conversationId/meetup ──────────────────────────
describe("PATCH /api/conversations/:conversationId/meetup", () => {
  it("sets meetup location on the linked trade", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/meetup`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ meetupLocation: "Central Station" });

    expect(res.status).toBe(200);
    expect(res.body.meetupLocation).toBe("Central Station");
    expect(res.body.meetupScheduledAt).toBeTruthy();
  });

  it("accepts an explicit meetupScheduledAt", async () => {
    const { seller, trade } = await fullTradeSetup();
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();

    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/meetup`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ meetupLocation: "Market St Bus Stop", meetupScheduledAt: futureDate });

    expect(res.status).toBe(200);
    expect(res.body.meetupLocation).toBe("Market St Bus Stop");
    expect(new Date(res.body.meetupScheduledAt).toISOString()).toBe(futureDate);
  });

  it("buyer can also set meetup", async () => {
    const { buyer, trade } = await fullTradeSetup();

    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/meetup`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ meetupLocation: "Union Square" });

    expect(res.status).toBe(200);
    expect(res.body.meetupLocation).toBe("Union Square");
  });

  it("rejects empty meetupLocation", async () => {
    const { seller, trade } = await fullTradeSetup();

    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/meetup`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ meetupLocation: "" });

    expect(res.status).toBe(400);
  });

  it("third party receives 403", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .patch(`/api/conversations/${trade.conversationId}/meetup`)
      .set("Authorization", `Bearer ${third.accessToken}`)
      .send({ meetupLocation: "Somewhere" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent conversation", async () => {
    const { seller } = await fullTradeSetup();
    const res = await request(app)
      .patch("/api/conversations/00000000-0000-0000-0000-000000000000/meetup")
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ meetupLocation: "Somewhere" });

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/conversations/:conversationId/messages ─────────────────────────
describe("POST /api/conversations/:conversationId/messages", () => {
  it("participant can send a text message", async () => {
    const { buyer, trade } = await fullTradeSetup();

    const res = await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "Hey, when can we meet?", type: "text" });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe("Hey, when can we meet?");
    expect(res.body.senderId).toBe(buyer.user.id);
    expect(res.body.conversationId).toBe(trade.conversationId);
  });

  it("sent message appears in the message list", async () => {
    const { seller, buyer, trade } = await fullTradeSetup();
    const convId = trade.conversationId;

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "First message" });

    await request(app)
      .post(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ body: "Reply from seller" });

    const res = await request(app)
      .get(`/api/conversations/${convId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("rejects empty message body", async () => {
    const { buyer, trade } = await fullTradeSetup();

    const res = await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ body: "", type: "text" });

    expect(res.status).toBe(400);
  });

  it("third party cannot send messages", async () => {
    const { trade } = await fullTradeSetup();
    const third = await registerUser();

    const res = await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .set("Authorization", `Bearer ${third.accessToken}`)
      .send({ body: "Intruder message" });

    expect(res.status).toBe(403);
  });

  it("requires authentication", async () => {
    const { trade } = await fullTradeSetup();
    const res = await request(app)
      .post(`/api/conversations/${trade.conversationId}/messages`)
      .send({ body: "Anon message" });

    expect(res.status).toBe(401);
  });
});
