import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser } from "./helpers/fixtures.js";

describe("POST /api/users/:userId/follow", () => {
  it("follows another user", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    const res = await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.following).toBe(true);
    expect(res.body.followeeId).toBe(other.user.id);
  });

  it("is idempotent when already following", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.following).toBe(true);
  });

  it("rejects following yourself", async () => {
    const user = await registerUser();
    const res = await request(app)
      .post(`/api/users/${user.user.id}/follow`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("rejects follow when either user has blocked the other", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/blocks/${other.user.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    const res = await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post(
      "/api/users/00000000-0000-4000-8000-000000000099/follow",
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/users/:userId/follow", () => {
  it("unfollows and is idempotent", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const first = await request(app)
      .delete(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(first.status).toBe(204);

    const second = await request(app)
      .delete(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(second.status).toBe(204);
  });
});

describe("GET /api/users/me/following", () => {
  it("lists following newest first", async () => {
    const viewer = await registerUser();
    const a = await registerUser();
    const b = await registerUser();

    await request(app)
      .post(`/api/users/${a.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    await request(app)
      .post(`/api/users/${b.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .get("/api/users/me/following")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].userId).toBe(b.user.id);
    expect(res.body.items[1].userId).toBe(a.user.id);
    expect(res.body.items[0].displayName).toBeTruthy();
  });
});

describe("GET /api/users/:userId follow fields", () => {
  it("returns counts and isFollowing for authenticated viewers", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .get(`/api/users/${other.user.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.isFollowing).toBe(true);
    expect(res.body.followerCount).toBe(1);
    expect(res.body.followingCount).toBe(0);
  });

  it("returns isFollowing false for guests", async () => {
    const other = await registerUser();
    const res = await request(app).get(`/api/users/${other.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.isFollowing).toBe(false);
    expect(res.body.followerCount).toBe(0);
  });
});

describe("block clears follow edges", () => {
  it("removes follow when either user blocks the other", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    await request(app)
      .post(`/api/blocks/${other.user.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    const list = await request(app)
      .get("/api/users/me/following")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(list.body.items).toHaveLength(0);

    const profile = await request(app)
      .get(`/api/users/${other.user.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(profile.body.isFollowing).toBe(false);
    expect(profile.body.followerCount).toBe(0);
  });
});
