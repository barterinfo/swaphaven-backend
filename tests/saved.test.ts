import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";

describe("POST /api/saved/:listingId", () => {
  it("saves an active listing for the caller", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const res = await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.saved).toBe(true);
    expect(res.body.listingId).toBe(listing.id);
  });

  it("is idempotent when already saved", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it("rejects saving own listing", async () => {
    const user = await registerUser();
    const listing = await createListing(user.accessToken);

    const res = await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bad_request");
  });

  it("returns 404 for unknown listing", async () => {
    const viewer = await registerUser();
    const res = await request(app)
      .post("/api/saved/00000000-0000-4000-8000-000000000099")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).post(
      "/api/saved/00000000-0000-4000-8000-000000000099",
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/saved/:listingId", () => {
  it("unsaves a listing and is idempotent", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const first = await request(app)
      .delete(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(first.status).toBe(204);

    const second = await request(app)
      .delete(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(second.status).toBe(204);
  });
});

describe("GET /api/saved", () => {
  it("lists saved listings newest first", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const a = await createListing(owner.accessToken, { title: "Saved A" });
    const b = await createListing(owner.accessToken, { title: "Saved B" });

    await request(app)
      .post(`/api/saved/${a.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    await request(app)
      .post(`/api/saved/${b.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .get("/api/saved")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].listing.id).toBe(b.id);
    expect(res.body.items[0].listing.is_saved).toBe(true);
    expect(res.body.items[1].listing.id).toBe(a.id);
  });

  it("survives a left swipe (save is independent of pass)", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ listingId: listing.id, direction: "left" });

    const res = await request(app)
      .get("/api/saved")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { listing: { id: string } }) => i.listing.id))
      .toContain(listing.id);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/api/saved");
    expect(res.status).toBe(401);
  });
});

describe("is_saved on listing detail and deck", () => {
  it("includes is_saved on GET /api/listings/:id when authenticated", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const before = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(before.status).toBe(200);
    expect(before.body.is_saved).toBe(false);
    expect(before.body.listing.is_saved).toBe(false);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const after = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(after.body.is_saved).toBe(true);
    expect(after.body.listing.is_saved).toBe(true);
  });

  it("returns save_count of saves on owner listing stats", async () => {
    const owner = await registerUser();
    const saverA = await registerUser();
    const saverB = await registerUser();
    const listing = await createListing(owner.accessToken);

    const before = await request(app)
      .get(`/api/listings/${listing.id}/stats`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(before.status).toBe(200);
    expect(before.body.save_count).toBe(0);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${saverA.accessToken}`);
    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${saverB.accessToken}`);

    const after = await request(app)
      .get(`/api/listings/${listing.id}/stats`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(after.status).toBe(200);
    expect(after.body.save_count).toBe(2);
  });

  it("includes is_saved on deck cards", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post(`/api/saved/${listing.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    const res = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    const card = res.body.cards.find(
      (c: { listing: { id: string } }) => c.listing.id === listing.id,
    );
    expect(card).toBeTruthy();
    expect(card.is_saved).toBe(true);
    expect(card.listing.is_saved).toBe(true);
  });
});
