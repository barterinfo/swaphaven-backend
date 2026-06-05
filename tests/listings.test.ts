import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./helpers/app.js";
import { registerUser, createListing, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { categoriesTable } from "../src/db/schema/index.js";

// ─── GET /api/categories ──────────────────────────────────────────────────────
describe("GET /api/categories", () => {
  it("returns an empty array when no categories exist", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns seeded categories", async () => {
    await testDb.insert(categoriesTable).values([
      { name: "Electronics", slug: `electronics-${uid()}` },
      { name: "Clothing",    slug: `clothing-${uid()}` },
    ]);
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── GET /api/listings ────────────────────────────────────────────────────────
describe("GET /api/listings", () => {
  it("returns paginated listing feed", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken, { title: "Nintendo Switch" });
    await createListing(accessToken, { title: "Vintage Camera" });

    const res = await request(app).get("/api/listings");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeNull();
  });

  it("filters by keyword search", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken, { title: "Rare Vinyl Record" });
    await createListing(accessToken, { title: "Old Guitar" });

    const res = await request(app).get("/api/listings?q=vinyl");
    expect(res.status).toBe(200);
    const titles = res.body.items.map((l: { title: string }) => l.title);
    expect(titles).toContain("Rare Vinyl Record");
    expect(titles).not.toContain("Old Guitar");
  });

  it("respects limit parameter", async () => {
    const { accessToken } = await registerUser();
    for (let i = 0; i < 5; i++) await createListing(accessToken);

    const res = await request(app).get("/api/listings?limit=3");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.nextCursor).not.toBeNull();
  });

  it("includes right swipe counts on listings and items arrays", async () => {
    const owner = await registerUser();
    const swiper1 = await registerUser();
    const swiper2 = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${swiper1.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });
    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${swiper2.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    const res = await request(app).get("/api/listings");
    expect(res.status).toBe(200);
    const barter = res.body.listings.find((l: { id: string }) => l.id === listing.id);
    const item = res.body.items.find((l: { id: string }) => l.id === listing.id);
    expect(barter.right_swipe_count).toBe(2);
    expect(item.rightSwipeCount).toBe(2);
  });
});

// ─── POST /api/listings ───────────────────────────────────────────────────────
describe("POST /api/listings", () => {
  it("creates a new listing", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Laptop", condition: "like_new", description: "Barely used" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe("My Laptop");
    expect(res.body.status).toBe("active");
  });

  it("requires authentication", async () => {
    const res = await request(app)
      .post("/api/listings")
      .send({ title: "Unauth Listing", condition: "good" });
    expect(res.status).toBe(401);
  });

  it("rejects missing title", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ condition: "good" });
    expect(res.status).toBe(400);
  });

  it("accepts barter-stack / Flutter create listing body (slug categories, no UUID)", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Vintage Camera",
        description: "Works great",
        categoryId: "cameras",
        category: "Cameras",
        estimatedValue: 250,
        condition: "great",
        acceptCashTopUps: true,
        wantedCategoryIds: ["electronics", "books"],
        wantedCategories: ["Electronics", "Books"],
        details: { ageRange: "5-10 years", brand: "Canon" },
        location: { lat: 37.77, lng: -122.42, address: "San Francisco, CA" },
        images: [
          "https://cdn.example.com/listings/photo1.jpg",
          "/tmp/ignored-local.jpg",
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.listing).toBeTruthy();
    expect(res.body.listing.title).toBe("Vintage Camera");
    expect(res.body.listing.category).toBe("Cameras");
    expect(res.body.listing.estimated_value).toBe(250);
    expect(res.body.listing.accept_cash_top_ups).toBe(true);
    expect(res.body.listing.wanted_category_ids).toEqual(["electronics", "books"]);
    expect(res.body.listing.images).toEqual([
      "https://cdn.example.com/listings/photo1.jpg",
    ]);
  });
});

// ─── GET /api/listings/:id ────────────────────────────────────────────────────
describe("GET /api/listings/:id", () => {
  it("returns listing detail with images array", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app).get(`/api/listings/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(listing.id);
    expect(Array.isArray(res.body.images)).toBe(true);
  });

  it("returns 404 for non-existent listing", async () => {
    const res = await request(app).get("/api/listings/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /api/listings/:id ──────────────────────────────────────────────────
describe("PATCH /api/listings/:id", () => {
  it("owner can update title and description", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Updated Title", description: "Better description" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Title");
  });

  it("non-owner receives 403", async () => {
    const { accessToken: ownerToken } = await registerUser();
    const listing = await createListing(ownerToken);

    const { accessToken: otherToken } = await registerUser();
    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ title: "Stolen update" });

    expect(res.status).toBe(403);
  });
});

// ─── DELETE /api/listings/:id ─────────────────────────────────────────────────
describe("DELETE /api/listings/:id", () => {
  it("owner can soft-delete listing", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const deleteRes = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/listings/${listing.id}`);
    expect(getRes.status).toBe(404);
  });

  it("non-owner receives 403", async () => {
    const { accessToken: ownerToken } = await registerUser();
    const listing = await createListing(ownerToken);

    const { accessToken: otherToken } = await registerUser();
    const res = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});

// ─── POST /api/listings/:id/images ────────────────────────────────────────────
describe("POST /api/listings/:id/images", () => {
  it("owner can add an image URL to a listing", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .post(`/api/listings/${listing.id}/images`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ url: "https://example.com/photo.jpg", position: 0 });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://example.com/photo.jpg");
  });

  it("non-owner receives 403", async () => {
    const { accessToken: ownerToken } = await registerUser();
    const listing = await createListing(ownerToken);

    const { accessToken: otherToken } = await registerUser();
    const res = await request(app)
      .post(`/api/listings/${listing.id}/images`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ url: "https://evil.com/x.jpg" });

    expect(res.status).toBe(403);
  });
});

// ─── DELETE /api/listings/:id/images/:imageId ─────────────────────────────────
describe("DELETE /api/listings/:id/images/:imageId", () => {
  it("owner can remove an image", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const addRes = await request(app)
      .post(`/api/listings/${listing.id}/images`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ url: "https://example.com/photo.jpg", position: 0 });
    expect(addRes.status).toBe(201);

    const delRes = await request(app)
      .delete(`/api/listings/${listing.id}/images/${addRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(delRes.status).toBe(204);
  });
});
