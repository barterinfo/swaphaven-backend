import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { listingsTable } from "../src/db/schema/index.js";

describe("GET /api/search/trending", () => {
  it("returns trending active listings (not search keywords)", async () => {
    const owner = await registerUser();
    const swiper = await registerUser();
    const hot = await createListing(owner.accessToken, {
      title: `TrendingHot-${uid()}`,
    });
    await createListing(owner.accessToken, { title: `TrendingCold-${uid()}` });

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${swiper.accessToken}`)
      .send({ listingId: hot.id, direction: "right" });

    const res = await request(app).get("/api/search/trending?limit=10");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
    expect(res.body.listings.length).toBeGreaterThan(0);
    expect(res.body.listings[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      status: "active",
    });
    const ids = res.body.listings.map((l: { id: string }) => l.id);
    expect(ids).toContain(hot.id);
  });
});

describe("GET /api/search/listings", () => {
  it("returns active listings matching a keyword", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken, { title: `Canon Camera ${uid()}` });
    await createListing(accessToken, { title: `Old Guitar ${uid()}` });

    const res = await request(app).get("/api/search/listings?q=camera");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const titles = res.body.listings.map((l: { title: string }) => l.title.toLowerCase());
    expect(titles.some((t: string) => t.includes("camera"))).toBe(true);
    expect(titles.every((t: string) => !t.includes("guitar") || t.includes("camera"))).toBe(true);
  });

  it("requires all tokens for multi-word queries", async () => {
    const { accessToken } = await registerUser();
    const marker = uid();
    await createListing(accessToken, {
      title: `Vintage Lens ${marker}`,
      description: "optics only",
    });
    await createListing(accessToken, {
      title: `Vintage Frame ${marker}`,
      description: "picture border only",
    });

    const res = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(`Vintage Lens ${marker}`)}`,
    );
    expect(res.status).toBe(200);
    const titles = res.body.listings.map((l: { title: string }) => l.title);
    expect(titles).toContain(`Vintage Lens ${marker}`);
    expect(titles).not.toContain(`Vintage Frame ${marker}`);
  });

  it("excludes traded listings even when title matches", async () => {
    const { accessToken } = await registerUser();
    const marker = `SoldCam-${uid()}`;
    const listing = await createListing(accessToken, { title: marker });

    await testDb
      .update(listingsTable)
      .set({ status: "traded" })
      .where(eq(listingsTable.id, listing.id));

    const res = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(marker)}`,
    );
    expect(res.status).toBe(200);
    const ids = res.body.listings.map((l: { id: string }) => l.id);
    expect(ids).not.toContain(listing.id);
    expect(res.body.total).toBe(0);
  });

  it("ignores very short queries as empty text search", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken, { title: `ShortQ-${uid()}` });

    const res = await request(app).get("/api/search/listings?q=a&limit=5");
    expect(res.status).toBe(200);
    expect(res.body.listings.length).toBeGreaterThan(0);
    expect(typeof res.body.total).toBe("number");
  });

  it("supports offset pagination and total count", async () => {
    const { accessToken } = await registerUser();
    const marker = `PageCam-${uid()}`;
    for (let i = 0; i < 3; i++) {
      await createListing(accessToken, { title: `${marker}-${i}` });
    }

    const page1 = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(marker)}&limit=2&offset=0`,
    );
    expect(page1.status).toBe(200);
    expect(page1.body.listings).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.nextOffset).toBe(2);

    const page2 = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(marker)}&limit=2&offset=2`,
    );
    expect(page2.status).toBe(200);
    expect(page2.body.listings).toHaveLength(1);
    expect(page2.body.nextOffset).toBeNull();
  });

  it("excludes the authenticated user's own listings", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const marker = `OwnExcl-${uid()}`;
    const mine = await createListing(owner.accessToken, { title: marker });
    await createListing(other.accessToken, { title: `${marker}-other` });

    const res = await request(app)
      .get(`/api/search/listings?q=${encodeURIComponent(marker)}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.listings.map((l: { id: string }) => l.id);
    expect(ids).not.toContain(mine.id);
  });

  it("filters by condition csv", async () => {
    const { accessToken } = await registerUser();
    const marker = `Cond-${uid()}`;
    await createListing(accessToken, {
      title: `${marker}-ln`,
      condition: "like_new",
    });
    await createListing(accessToken, {
      title: `${marker}-fair`,
      condition: "fair",
    });

    const res = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(marker)}&condition=like_new`,
    );
    expect(res.status).toBe(200);
    expect(res.body.listings.length).toBeGreaterThanOrEqual(1);
    for (const l of res.body.listings) {
      expect(l.condition).toBe("like_new");
    }
  });

  it("matches category slug against stored display labels", async () => {
    const { accessToken } = await registerUser();
    const marker = `CatSlug-${uid()}`;
    await createListing(accessToken, {
      title: marker,
      category: "Books",
      location: {
        lat: 37.7873696,
        lng: -122.4082339,
        city: "San Francisco",
      },
    });

    const res = await request(app).get(
      `/api/search/listings?q=${encodeURIComponent(marker)}&category=books`,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.listings.some((l: { title: string }) => l.title === marker)).toBe(
      true,
    );
  });

  it("hides listings in an active offer with the viewer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const marker = `OfferHide-${uid()}`;
    const target = await createListing(seller.accessToken, { title: marker });
    const buyerItem = await createListing(buyer.accessToken, {
      title: `BuyerItem-${uid()}`,
    });
    await createOffer(buyer.accessToken, target.id, buyerItem.id);

    const asBuyer = await request(app)
      .get(`/api/search/listings?q=${encodeURIComponent(marker)}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(asBuyer.status).toBe(200);
    expect(asBuyer.body.listings.map((l: { id: string }) => l.id)).not.toContain(
      target.id,
    );

    const asSeller = await request(app)
      .get(`/api/search/listings?q=${encodeURIComponent(marker)}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(asSeller.status).toBe(200);
    expect(asSeller.body.listings.map((l: { id: string }) => l.id)).not.toContain(
      target.id,
    );
  });

  it("accepts seed_ids without error (Phase 1 ignore)", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken, { title: `Seed-${uid()}` });
    const res = await request(app).get(
      `/api/search/listings?seed_ids=${listing.id}&limit=5`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.listings)).toBe(true);
  });
});
