import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing, createOffer } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { notificationsTable } from "../src/db/schema/index.js";

async function waitForNotifications(
  userId: string,
  predicate: (rows: { type: string; body: string; burstCount: number; relatedListingId: string | null }[]) => boolean,
) {
  let rows: { type: string; body: string; burstCount: number; relatedListingId: string | null }[] = [];
  for (let i = 0; i < 30; i++) {
    rows = await testDb
      .select({
        type: notificationsTable.type,
        body: notificationsTable.body,
        burstCount: notificationsTable.burstCount,
        relatedListingId: notificationsTable.relatedListingId,
      })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId));
    if (predicate(rows)) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
  return rows;
}

describe("follow activity", () => {
  it("lists followers and notifies the followee", async () => {
    const viewer = await registerUser();
    const other = await registerUser();

    await request(app)
      .post(`/api/users/${other.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    const list = await request(app)
      .get("/api/users/me/followers")
      .set("Authorization", `Bearer ${other.accessToken}`)
      .expect(200);

    expect(list.body.items).toEqual([
      expect.objectContaining({ userId: viewer.user.id }),
    ]);

    const notes = await waitForNotifications(
      other.user.id,
      (rows) => rows.some((row) => row.type === "new_follower"),
    );
    expect(notes.some((row) => row.type === "new_follower" && row.body.includes("started following"))).toBe(true);
  });

  it("skips listing alerts when the follow is muted", async () => {
    const follower = await registerUser();
    const seller = await registerUser();

    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    await request(app)
      .patch(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .send({ alertsMuted: true })
      .expect(200);

    await createListing(seller.accessToken, { title: "Muted Item" });
    await new Promise((r) => setTimeout(r, 150));

    const rows = await testDb
      .select({ type: notificationsTable.type })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, follower.user.id));

    expect(rows.filter((row) => row.type === "followed_listing")).toHaveLength(0);
  });

  it("skips listing alerts when the global switch is off", async () => {
    const follower = await registerUser();
    const seller = await registerUser();

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .send({ followListingAlerts: false })
      .expect(200);

    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    await createListing(seller.accessToken, { title: "Quiet Switch" });
    await new Promise((r) => setTimeout(r, 150));

    const rows = await testDb
      .select({ type: notificationsTable.type })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, follower.user.id));

    expect(rows.filter((row) => row.type === "followed_listing")).toHaveLength(0);
  });

  it("collapses a burst of listings into one alert", async () => {
    const follower = await registerUser();
    const seller = await registerUser();

    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    await createListing(seller.accessToken, { title: "First" });
    await waitForNotifications(
      follower.user.id,
      (rows) => rows.some((row) => row.type === "followed_listing"),
    );
    await createListing(seller.accessToken, { title: "Second" });

    const rows = await waitForNotifications(
      follower.user.id,
      (found) => found.some((row) => row.type === "followed_listing" && row.burstCount === 2),
    );
    const listingNotes = rows.filter((row) => row.type === "followed_listing");
    expect(listingNotes).toHaveLength(1);
    expect(listingNotes[0]!.body).toContain("listed 2 items");
  });

  it("notifies on price change and when a paused listing is active again", async () => {
    const follower = await registerUser();
    const seller = await registerUser();
    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    const listing = await createListing(seller.accessToken, { title: "Bike" });
    await waitForNotifications(
      follower.user.id,
      (rows) => rows.some((row) => row.type === "followed_listing"),
    );

    await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ estimatedValueCents: 2500 })
      .expect(200);

    const priced = await waitForNotifications(
      follower.user.id,
      (rows) => rows.some((row) => row.type === "followed_listing_price"),
    );
    expect(priced.some((row) => row.body.includes("changed the price"))).toBe(true);

    await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ status: "paused" })
      .expect(200);
    await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ status: "active" })
      .expect(200);

    const relisted = await waitForNotifications(
      follower.user.id,
      (rows) => rows.some((row) => row.type === "followed_listing_relisted"),
    );
    expect(relisted.some((row) => row.body.includes("again"))).toBe(true);
  });

  it("notifies followers when a followed seller accepts a trade", async () => {
    const follower = await registerUser();
    const seller = await registerUser();
    const buyer = await registerUser();

    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    const sellerListing = await createListing(seller.accessToken, { title: "Lamp" });
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .expect(200);

    const rows = await waitForNotifications(
      follower.user.id,
      (found) => found.some((row) => row.type === "followed_trade_accepted"),
    );
    expect(rows.some((row) => row.type === "followed_trade_accepted" && row.body.includes("Lamp"))).toBe(true);
  });

  it("suggests a seller in the viewer's interest category", async () => {
    const viewer = await registerUser();
    const seller = await registerUser();
    await createListing(seller.accessToken, { title: "Camera", category: "electronics" });

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .send({ interestCategoryIds: ["electronics"] })
      .expect(200);

    const res = await request(app)
      .get("/api/users/me/suggestions")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(200);

    expect(res.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: seller.user.id }),
      ]),
    );
  });

  it("returns followed sellers' listings newest-first without ranking", async () => {
    const viewer = await registerUser();
    const seller = await registerUser();
    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(201);

    const listing = await createListing(seller.accessToken, { title: "Followed Only" });

    const res = await request(app)
      .get("/api/search/followed")
      .set("Authorization", `Bearer ${viewer.accessToken}`)
      .expect(200);

    const ids = (res.body.listings as { id: string }[]).map((row) => row.id);
    expect(ids).toContain(listing.id);
  });
});
