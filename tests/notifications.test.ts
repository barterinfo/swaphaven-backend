import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer, fullTradeSetup } from "./helpers/fixtures.js";

// ─── GET /api/notifications ───────────────────────────────────────────────────
describe("GET /api/notifications", () => {
  it("seller receives an offer_received notification when buyer makes an offer", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].type).toBe("offer_received");
    expect(res.body.items[0].isRead).toBe(false);
  });

  it("buyer receives offer_accepted notification when seller accepts", async () => {
    const { buyer } = await fullTradeSetup();

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    // Buyer should have at least one accepted notification
    const types = res.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain("offer_accepted");
  });

  it("returns empty list for user with no notifications", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/notifications?unreadOnly=true ───────────────────────────────────
describe("GET /api/notifications?unreadOnly=true", () => {
  it("returns only unread notifications", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const res = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    res.body.items.forEach((n: { isRead: boolean }) => {
      expect(n.isRead).toBe(false);
    });
  });
});

// ─── PATCH /api/notifications/:notificationId/read ────────────────────────────
describe("PATCH /api/notifications/:notificationId/read", () => {
  it("marks a single notification as read", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const listRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${seller.accessToken}`);
    const notifId = listRes.body.items[0].id;

    const patchRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(patchRes.status).toBe(204);

    // Verify it's now read
    const unreadRes = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const unreadIds = unreadRes.body.items.map((n: { id: string }) => n.id);
    expect(unreadIds).not.toContain(notifId);
  });
});

// ─── POST /api/notifications/read-all ────────────────────────────────────────
describe("POST /api/notifications/read-all", () => {
  it("marks all notifications as read", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);

    // Create multiple offers → multiple notifications
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const readAllRes = await request(app)
      .post("/api/notifications/read-all")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(readAllRes.status).toBe(204);

    // All notifications should now be read
    const unreadRes = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(unreadRes.body.items).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/notifications/read-all");
    expect(res.status).toBe(401);
  });
});

// ─── Deny/Withdraw notification side effects ──────────────────────────────────
describe("Notification side effects from offer actions", () => {
  it("buyer receives offer_denied notification when seller denies", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await request(app)
      .post(`/api/offers/${offer.id}/deny`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    const types = res.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain("offer_denied");
  });

  it("seller receives offer_withdrawn notification when buyer withdraws", async () => {
    const seller = await registerUser();
    const buyer  = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing  = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await request(app)
      .post(`/api/offers/${offer.id}/withdraw`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    const res = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const types = res.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain("offer_withdrawn");
  });
});
