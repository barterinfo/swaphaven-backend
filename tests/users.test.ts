import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";

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
  });

  it("returns empty for user with no listings", async () => {
    const { user } = await registerUser();
    const res = await request(app).get(`/api/users/${user.id}/listings`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
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
