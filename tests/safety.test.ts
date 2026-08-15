import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";

describe("POST /api/blocks/:userId", () => {
  it("blocks another user (one-way) and is idempotent", async () => {
    const a = await registerUser();
    const b = await registerUser();

    const first = await request(app)
      .post(`/api/blocks/${b.user.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(first.status).toBe(201);
    expect(first.body.blocked).toBe(true);

    const second = await request(app)
      .post(`/api/blocks/${b.user.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(second.status).toBe(200);
    expect(second.body.blocked).toBe(true);
  });

  it("rejects blocking yourself", async () => {
    const a = await registerUser();
    const res = await request(app)
      .post(`/api/blocks/${a.user.id}`)
      .set("Authorization", `Bearer ${a.accessToken}`);
    expect(res.status).toBe(400);
  });

  it("hides blocked user's listings from the swipe deck", async () => {
    const viewer = await registerUser();
    const blocked = await registerUser();
    const other = await registerUser();

    const blockedListing = await createListing(blocked.accessToken);
    const visibleListing = await createListing(other.accessToken);

    await request(app)
      .post(`/api/blocks/${blocked.user.id}`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    const deck = await request(app)
      .get("/api/swipe/deck")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(deck.status).toBe(200);
    const ids = (deck.body.cards as Array<{ listing: { id: string } }>).map(
      (c) => c.listing.id,
    );
    expect(ids).toContain(visibleListing.id);
    expect(ids).not.toContain(blockedListing.id);
  });
});

describe("POST /api/reports", () => {
  it("queues a listing report as pending without banning", async () => {
    const reporter = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.accessToken}`)
      .send({
        targetType: "listing",
        targetId: listing.id,
        reason: "spam",
        details: "Looks like a fake listing",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.queued).toBe(true);

    // Reported user's listing still exists for everyone else (no auto-ban).
    const stillThere = await request(app)
      .get(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it("is idempotent for the same reporter + target", async () => {
    const reporter = await registerUser();
    const other = await registerUser();

    await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.accessToken}`)
      .send({ targetType: "user", targetId: other.user.id, reason: "harassment" })
      .expect(201);

    const again = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${reporter.accessToken}`)
      .send({ targetType: "user", targetId: other.user.id, reason: "scam" });

    expect(again.status).toBe(200);
    expect(again.body.queued).toBe(true);
  });

  it("rejects reporting yourself", async () => {
    const user = await registerUser();
    const res = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ targetType: "user", targetId: user.user.id, reason: "other" });
    expect(res.status).toBe(400);
  });
});
