import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";

// ─── GET /api/swipe/deck ──────────────────────────────────────────────────────
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
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/swipe/deck");
    expect(res.status).toBe(401);
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
