import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { categoryIdBySlug } from "../src/lib/categories.js";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { categoriesTable, listingsTable } from "../src/db/schema/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── GET /api/categories ──────────────────────────────────────────────────────
describe("GET /api/categories", () => {
  it("returns the canonical seeded categories", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(10);
    expect(res.body.some((c: { slug: string }) => c.slug === "electronics")).toBe(
      true,
    );
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
    const categoryId = categoryIdBySlug("electronics")!;
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "My Laptop",
        condition: "like_new",
        description: "Barely used",
        categoryId,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.title).toBe("My Laptop");
    expect(res.body.status).toBe("active");
    expect(res.body.listing?.category_id).toBe(categoryId);
  });

  it("rejects create without categoryId", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "My Laptop", condition: "like_new" });
    expect(res.status).toBe(400);
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

  it("requires a UUID categoryId and stores the category FK", async () => {
    const { accessToken } = await registerUser();
    const camerasId = categoryIdBySlug("cameras")!;
    const electronicsId = categoryIdBySlug("electronics")!;
    const booksId = categoryIdBySlug("books")!;

    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Vintage Camera",
        description: "Works great",
        categoryId: camerasId,
        category: "Cameras",
        estimatedValue: 250,
        condition: "great",
        acceptCashTopUps: true,
        wantedCategoryIds: [electronicsId, booksId],
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
    expect(res.body.listing.wanted_category_ids).toEqual([
      electronicsId,
      booksId,
    ]);
    expect(res.body.listing.images).toEqual([
      "https://cdn.example.com/listings/photo1.jpg",
    ]);
  });

  it("rejects create listing without a UUID categoryId", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/listings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "No Category",
        categoryId: "cameras",
        condition: "good",
      });
    expect(res.status).toBe(400);
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

  it("returns seller card with snake_case fields and no owner_email", async () => {
    const { user, accessToken } = await registerUser();
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ displayName: "Seller Name", locationCity: "Austin" });
    const listing = await createListing(accessToken);

    const res = await request(app).get(`/api/listings/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.listing.owner_email).toBeUndefined();
    expect(res.body.listing.seller).toMatchObject({
      id: user.id,
      display_name: "Seller Name",
      location_city: "Austin",
      is_verified: false,
      is_phone_verified: false,
      total_trades: 0,
      rating: null,
    });
    expect(res.body.listing.seller.member_since).toBeTruthy();
  });

  it("returns view_count and right_swipe_count on listing detail", async () => {
    const owner = await registerUser();
    const swiper = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .post("/api/swipe")
      .set("Authorization", `Bearer ${swiper.accessToken}`)
      .send({ listingId: listing.id, direction: "right" });

    const res = await request(app).get(`/api/listings/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.listing.view_count).toBe(0);
    expect(res.body.listing.right_swipe_count).toBe(1);
  });

  it("returns offer_count for open (pending/countered) offers", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);

    const before = await request(app).get(`/api/listings/${sellerListing.id}`);
    expect(before.status).toBe(200);
    expect(before.body.listing.offer_count).toBe(0);

    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const after = await request(app).get(`/api/listings/${sellerListing.id}`);
    expect(after.status).toBe(200);
    expect(after.body.listing.offer_count).toBe(1);
    expect(after.body.offer_count).toBe(1);
  });
});

// ─── POST /api/listings/:id/view ──────────────────────────────────────────────
describe("POST /api/listings/:id/view", () => {
  it("returns 204 when authenticated and increments view_count", async () => {
    const viewer = await registerUser();
    const owner = await registerUser();
    const listing = await createListing(owner.accessToken);

    const res = await request(app)
      .post(`/api/listings/${listing.id}/view`)
      .set("Authorization", `Bearer ${viewer.accessToken}`);
    expect(res.status).toBe(204);

    await sleep(50);
    const [row] = await testDb
      .select({ viewCount: listingsTable.viewCount })
      .from(listingsTable)
      .where(eq(listingsTable.id, listing.id));
    expect(row?.viewCount).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app).post(`/api/listings/${listing.id}/view`);
    expect(res.status).toBe(401);
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

  it("owner can update open-to-trade preferences", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);
    const sneakersId = categoryIdBySlug("sneakers")!;
    const electronicsId = categoryIdBySlug("electronics")!;

    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        wantedCategoryIds: [sneakersId, electronicsId],
        wantedCategories: ["Sneakers", "Electronics"],
      });

    expect(res.status).toBe(200);
    expect(res.body.listing.wanted_categories).toEqual(["Sneakers", "Electronics"]);
    expect(res.body.listing.wanted_category_ids).toEqual([
      sneakersId,
      electronicsId,
    ]);
  });

  it("ignores status and locationCity — not part of the edit contract", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "deleted", locationCity: "Elsewhere", title: "Still active listing" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Still active listing");
    expect(res.body.status).toBe("active");
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

// ─── GET /api/listings/trending ───────────────────────────────────────────────
describe("GET /api/listings/trending", () => {
  it("returns { trending, others } shape with 200", async () => {
    const { accessToken } = await registerUser();
    await createListing(accessToken);

    const res = await request(app).get("/api/listings/trending");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trending)).toBe(true);
    expect(Array.isArray(res.body.others)).toBe(true);
  });

  it("excludes the authenticated user's own listings", async () => {
    const owner = await registerUser();
    const other = await registerUser();

    const ownListing = await createListing(owner.accessToken, { title: "My Own Item" });
    await createListing(other.accessToken, { title: "Someone Else's Item" });

    const res = await request(app)
      .get("/api/listings/trending")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    const allIds = [
      ...res.body.trending.map((l: { id: string }) => l.id),
      ...res.body.others.map((l: { id: string }) => l.id),
    ];
    expect(allIds).not.toContain(ownListing.id);
  });

  it("does not require authentication", async () => {
    const res = await request(app).get("/api/listings/trending");
    expect(res.status).toBe(200);
  });

  it("includes all active listings when no location params are given", async () => {
    const { accessToken } = await registerUser();
    const a = await createListing(accessToken, { title: "No-Filter A" });
    const b = await createListing(accessToken, { title: "No-Filter B" });

    // Fetch as another user so own listings are not excluded.
    const viewer = await registerUser();
    const res = await request(app)
      .get("/api/listings/trending")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    const allIds = [
      ...res.body.trending.map((l: { id: string }) => l.id),
      ...res.body.others.map((l: { id: string }) => l.id),
    ];
    expect(allIds).toContain(a.id);
    expect(allIds).toContain(b.id);
  });

  it("radius filter includes listings without coordinates as a fallback", async () => {
    const { accessToken } = await registerUser();
    // Listing with no location set.
    const noLoc = await createListing(accessToken, { title: "No Location" });

    const viewer = await registerUser();
    // Tiny radius centred far away (middle of the Pacific) — only no-location
    // listings should survive.
    const res = await request(app)
      .get("/api/listings/trending")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .query({ lat: 0, lng: -170, radius: 1 });

    expect(res.status).toBe(200);
    const allIds = [
      ...res.body.trending.map((l: { id: string }) => l.id),
      ...res.body.others.map((l: { id: string }) => l.id),
    ];
    expect(allIds).toContain(noLoc.id);
  });

  it("radius filter excludes listings whose coordinates are outside the radius", async () => {
    const owner = await registerUser();
    // New York listing (~2,900 mi from San Francisco).
    const nyListing = await createListing(owner.accessToken, {
      title: "New York Item",
      location: { lat: 40.7128, lng: -74.006, address: "New York, NY" },
    });
    // San Francisco listing — well within a 10 mi radius of the query point.
    const sfListing = await createListing(owner.accessToken, {
      title: "San Francisco Item",
      location: { lat: 37.7749, lng: -122.4194, address: "San Francisco, CA" },
    });

    const viewer = await registerUser();
    const res = await request(app)
      .get("/api/listings/trending")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .query({ lat: 37.7749, lng: -122.4194, radius: 10 });

    expect(res.status).toBe(200);
    const allIds = [
      ...res.body.trending.map((l: { id: string }) => l.id),
      ...res.body.others.map((l: { id: string }) => l.id),
    ];
    expect(allIds).toContain(sfListing.id);
    expect(allIds).not.toContain(nyListing.id);
  });

  it("most-liked listing appears in trending before others", async () => {
    const owner = await registerUser();
    const popular = await createListing(owner.accessToken, { title: "Popular Item" });
    const plain   = await createListing(owner.accessToken, { title: "Plain Item" });

    // Give the popular listing two right-swipes.
    const swiper1 = await registerUser();
    const swiper2 = await registerUser();
    for (const sw of [swiper1, swiper2]) {
      await request(app)
        .post("/api/swipe")
        .set("Authorization", `Bearer ${sw.accessToken}`)
        .send({ listingId: popular.id, direction: "right" });
    }

    const viewer = await registerUser();
    const res = await request(app)
      .get("/api/listings/trending")
      .set("Authorization", `Bearer ${viewer.accessToken}`);

    expect(res.status).toBe(200);
    const trendingIds = res.body.trending.map((l: { id: string }) => l.id);
    const othersIds   = res.body.others.map((l: { id: string }) => l.id);

    expect(trendingIds).toContain(popular.id);
    // The plain listing must appear in only one of the two arrays.
    const appearsInTrending = trendingIds.includes(plain.id);
    const appearsInOthers   = othersIds.includes(plain.id);
    expect(appearsInTrending || appearsInOthers).toBe(true);
    // And it should NOT appear in both.
    expect(appearsInTrending && appearsInOthers).toBe(false);
  });
});
