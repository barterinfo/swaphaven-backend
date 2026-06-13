import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { userProfilesTable } from "../src/db/schema/index.js";

// ─── GET /api/users/me ────────────────────────────────────────────────────────
describe("GET /api/users/me", () => {
  it("returns the user's own profile", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeTruthy();
    expect(res.body.displayName).toBeTruthy();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
describe("PATCH /api/users/me", () => {
  it("updates display name and bio", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ displayName: "Updated Name", bio: "I love swapping!" });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Updated Name");
    expect(res.body.bio).toBe("I love swapping!");
  });

  it("updates location coordinates", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ locationCity: "NYC", locationLat: 40.712776, locationLng: -74.005974 });

    expect(res.status).toBe(200);
    expect(res.body.locationCity).toBe("NYC");
  });

  it("ignores server-managed stats when sent in the body", async () => {
    const { accessToken, user } = await registerUser();
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        displayName: "Still Me",
        totalTrades: 999,
        ratingSum: 500,
        ratingCount: 100,
        isPhoneVerified: true,
        completionRate: 95,
        avgResponseMinutes: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Still Me");
    expect(res.body.totalTrades).toBe(0);
    expect(res.body.ratingSum).toBe(0);
    expect(res.body.ratingCount).toBe(0);
    expect(res.body.isPhoneVerified).toBe(false);
    expect(res.body.completionRate).toBeNull();
    expect(res.body.avgResponseMinutes).toBeNull();

    const [profile] = await testDb
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.id, user.id));
    expect(profile?.totalTrades).toBe(0);
    expect(profile?.ratingSum).toBe(0);
  });
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────
describe("GET /api/users/:userId", () => {
  it("returns a public profile without private location fields", async () => {
    const { user, accessToken } = await registerUser();

    // Set a location first
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ locationLat: 51.5, locationLng: -0.1, locationCity: "London" });

    const res = await request(app).get(`/api/users/${user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.locationLat).toBeUndefined();
    expect(res.body.locationLng).toBeUndefined();
    expect(res.body.hasLocation).toBe(true);
    expect(res.body.ratingSum).toBeUndefined();
    expect(res.body.ratingCount).toBeUndefined();
    expect(res.body.tradeScore).toBeUndefined();
    expect(res.body.updatedAt).toBeUndefined();
  });

  it("includes computed rating from review stats", async () => {
    const { user } = await registerUser();
    await testDb
      .update(userProfilesTable)
      .set({ ratingSum: 45, ratingCount: 10 })
      .where(eq(userProfilesTable.id, user.id));

    const res = await request(app).get(`/api/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(4.5);
  });

  it("returns 404 for unknown user", async () => {
    const res = await request(app).get("/api/users/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/users/:userId/listings ─────────────────────────────────────────
describe("GET /api/users/:userId/listings", () => {
  it("returns the user's listings", async () => {
    const { user, accessToken } = await registerUser();
    await createListing(accessToken);
    await createListing(accessToken);

    const res = await request(app).get(`/api/users/${user.id}/listings`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.total).toBe(2);
    for (const item of res.body.items) {
      expect(item.rightSwipeCount).toBe(0);
    }
  });

  it("includes rightSwipeCount reflecting received right swipes", async () => {
    const { user, accessToken } = await registerUser();
    const swiper = await registerUser();
    const listing = await createListing(accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${swiper.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    const res = await request(app).get(`/api/users/${user.id}/listings`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].rightSwipeCount).toBe(1);
  });

  it("returns empty for user with no listings", async () => {
    const { user } = await registerUser();
    const res = await request(app).get(`/api/users/${user.id}/listings`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("excludes deleted listings from items and total", async () => {
    const { user, accessToken } = await registerUser();
    const active = await createListing(accessToken);
    const doomed = await createListing(accessToken);

    await request(app)
      .delete(`/api/listings/${doomed.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app).get(`/api/users/${user.id}/listings`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(active.id);
    expect(res.body.total).toBe(1);
  });
});

// ─── GET /api/users/:userId/reviews ──────────────────────────────────────────
describe("GET /api/users/:userId/reviews", () => {
  it("returns empty array for user with no reviews", async () => {
    const { user } = await registerUser();
    const res = await request(app).get(`/api/users/${user.id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});
