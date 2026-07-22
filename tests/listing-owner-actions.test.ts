/**
 * Detailed integration coverage for owner listing lifecycle:
 * Mark as Sold, Soft Delete, and Edit (PATCH).
 *
 * Companion docs:
 * - docs/MARK_AS_SOLD_FLOW.md
 * - docs/DELETE_LISTING_FLOW.md
 * - docs/EDIT_LISTING_FLOW.md
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import {
  registerUser,
  createListing,
  createOffer,
  createCounter,
} from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { listingsTable, userProfilesTable } from "../src/db/schema/index.js";
import { categoryIdBySlug } from "../src/lib/categories.js";

// ─── POST /api/listings/:id/sold ──────────────────────────────────────────────
describe("POST /api/listings/:id/sold — mark as sold", () => {
  it("owner marks sold for cash → status traded, soldMethod set, trade count unchanged", async () => {
    const seller = await registerUser();
    const listing = await createListing(seller.accessToken);

    const before = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "sold_for_cash", shareWin: false });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("traded");
    expect(res.body.soldMethod).toBe("sold_for_cash");
    expect(res.body.shareWin).toBe(false);
    expect(res.body.listing?.status ?? res.body.status).toBeTruthy();

    const after = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });
    expect(after?.totalTrades).toBe(before?.totalTrades ?? 0);

    const row = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, listing.id),
    });
    expect(row?.status).toBe("traded");
    expect(row?.soldMethod).toBe("sold_for_cash");
  });

  it("owner marks sold as traded_on_barter → increments total_trades by 1", async () => {
    const seller = await registerUser();
    const listing = await createListing(seller.accessToken);

    const before = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "traded_on_barter" });

    expect(res.status).toBe(200);
    expect(res.body.soldMethod).toBe("traded_on_barter");

    const after = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });
    expect(after?.totalTrades).toBe((before?.totalTrades ?? 0) + 1);
  });

  it("owner marks sold as given_away → status traded without bumping trade count", async () => {
    const seller = await registerUser();
    const listing = await createListing(seller.accessToken);

    const before = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "given_away" });

    expect(res.status).toBe(200);
    expect(res.body.soldMethod).toBe("given_away");

    const after = await testDb.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, seller.user.id),
      columns: { totalTrades: true },
    });
    expect(after?.totalTrades).toBe(before?.totalTrades ?? 0);
  });

  it("stores optional tradedWithUserId when provided", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({
        soldMethod: "traded_on_barter",
        tradedWithUserId: buyer.user.id,
      });

    expect(res.status).toBe(200);
    const row = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, listing.id),
    });
    expect(row?.tradedWithUserId).toBe(buyer.user.id);
  });

  it("denies pending offers targeting the listing and notifies the buyer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    const soldRes = await request(app)
      .post(`/api/listings/${sellerListing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });
    expect(soldRes.status).toBe(200);

    const offerRes = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(offerRes.status).toBe(200);
    expect(offerRes.body.status).toBe("denied");

    const notifRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(notifRes.status).toBe(200);
    const types = notifRes.body.items.map((n: { type: string }) => n.type);
    expect(types).toContain("offer_denied");
    const denied = notifRes.body.items.find(
      (n: { type: string; body?: string }) => n.type === "offer_denied",
    );
    expect(denied?.body).toMatch(/marked as sold/i);
  });

  it("does not deny countered offers targeting the listing (known gap — UI strike)", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );
    await createCounter(
      seller.accessToken,
      offer.id,
      buyerListing.id,
      sellerListing.id,
    );

    const soldRes = await request(app)
      .post(`/api/listings/${sellerListing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });
    expect(soldRes.status).toBe(200);

    const offerRes = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(offerRes.status).toBe(200);
    expect(offerRes.body.status).toBe("countered");
    expect(offerRes.body.latestRound?.sellerItems?.[0]?.status).toBe("traded");
  });

  it("does not deny offers where the sold listing is only a buyer-side bundle item", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerItemA = await createListing(buyer.accessToken);
    const buyerItemB = await createListing(buyer.accessToken);
    const offerRes = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: sellerListing.id,
        offeredListingIds: [buyerItemA.id, buyerItemB.id],
      });
    expect(offerRes.status).toBe(201);
    const offerId = offerRes.body.id as string;

    // Mark one of the buyer's offered items sold (not the target).
    const soldRes = await request(app)
      .post(`/api/listings/${buyerItemA.id}/sold`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });
    expect(soldRes.status).toBe(200);

    const detail = await request(app)
      .get(`/api/offers/${offerId}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("pending");
    const soldInRound = detail.body.latestRound?.buyerItems?.find(
      (i: { id: string }) => i.id === buyerItemA.id,
    );
    expect(soldInRound?.status).toBe("traded");
    const stillActive = detail.body.latestRound?.buyerItems?.find(
      (i: { id: string }) => i.id === buyerItemB.id,
    );
    expect(stillActive?.status).toBe("active");
  });

  it("returns 409 when listing is already sold", async () => {
    const seller = await registerUser();
    const listing = await createListing(seller.accessToken);
    await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "given_away" });
    expect(res.status).toBe(409);
  });

  it("returns 409 when listing was deleted", async () => {
    const seller = await registerUser();
    const listing = await createListing(seller.accessToken);
    await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const res = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-owner and 400 for invalid soldMethod", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const listing = await createListing(owner.accessToken);

    const forbidden = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });
    expect(forbidden.status).toBe(403);

    const bad = await request(app)
      .post(`/api/listings/${listing.id}/sold`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ soldMethod: "not_a_method" });
    expect(bad.status).toBe(400);
  });

  it("accept is blocked after a pending-round item is marked sold", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    await request(app)
      .post(`/api/listings/${buyerListing.id}/sold`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ soldMethod: "sold_for_cash" });

    const accept = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(accept.status).toBe(409);
    expect(accept.body.message).toMatch(/no longer active/i);
  });
});

// ─── DELETE /api/listings/:id ─────────────────────────────────────────────────
describe("DELETE /api/listings/:id — soft delete", () => {
  it("owner soft-deletes → 204 and public GET returns 404", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const del = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(del.status).toBe(204);

    const get = await request(app).get(`/api/listings/${listing.id}`);
    expect(get.status).toBe(404);

    const row = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, listing.id),
    });
    expect(row?.status).toBe("deleted");
  });

  it("denies pending offers targeting the listing and notifies the buyer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    const del = await request(app)
      .delete(`/api/listings/${sellerListing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(del.status).toBe(204);

    const offerRes = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(offerRes.body.status).toBe("denied");

    const notifRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    const denied = notifRes.body.items.find(
      (n: { type: string; body?: string }) => n.type === "offer_denied",
    );
    expect(denied?.body).toMatch(/has been removed/i);
  });

  it("does not deny countered offers targeting the listing", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );
    await createCounter(
      seller.accessToken,
      offer.id,
      buyerListing.id,
      sellerListing.id,
    );

    await request(app)
      .delete(`/api/listings/${sellerListing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    const offerRes = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(offerRes.body.status).toBe("countered");
    expect(offerRes.body.latestRound?.sellerItems?.[0]?.status).toBe("deleted");
  });

  it("does not deny offers where a deleted listing is only a side item", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerItemA = await createListing(buyer.accessToken);
    const buyerItemB = await createListing(buyer.accessToken);
    const created = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: sellerListing.id,
        offeredListingIds: [buyerItemA.id, buyerItemB.id],
      });
    const offerId = created.body.id as string;

    await request(app)
      .delete(`/api/listings/${buyerItemA.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    const detail = await request(app)
      .get(`/api/offers/${offerId}`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(detail.body.status).toBe("pending");
    const deletedItem = detail.body.latestRound?.buyerItems?.find(
      (i: { id: string }) => i.id === buyerItemA.id,
    );
    expect(deletedItem?.status).toBe("deleted");
  });

  it("returns 409 when already deleted and 403 for non-owner", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const listing = await createListing(owner.accessToken);

    await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const again = await request(app)
      .delete(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(again.status).toBe(409);

    const listing2 = await createListing(owner.accessToken);
    const forbidden = await request(app)
      .delete(`/api/listings/${listing2.id}`)
      .set("Authorization", `Bearer ${other.accessToken}`);
    expect(forbidden.status).toBe(403);
  });

  it("accept is blocked after a pending-round item is deleted", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    await request(app)
      .delete(`/api/listings/${buyerListing.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    const accept = await request(app)
      .post(`/api/offers/${offer.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);
    expect(accept.status).toBe(409);
  });
});

// ─── PATCH /api/listings/:id — edit ───────────────────────────────────────────
describe("PATCH /api/listings/:id — edit listing", () => {
  it("owner can update title, description, condition, and value cents", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Edited Title",
        description: "Edited description",
        condition: "like_new",
        estimatedValueCents: 12500,
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Edited Title");
    expect(res.body.status).toBe("active");
    expect(res.body.listing?.description ?? res.body.description).toBeTruthy();

    const row = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, listing.id),
    });
    expect(row?.title).toBe("Edited Title");
    expect(row?.condition).toBe("like_new");
    expect(row?.estimatedValueCents).toBe(12500);
    expect(row?.status).toBe("active");
  });

  it("owner can update wanted categories without closing the listing", async () => {
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
    expect(res.body.status).toBe("active");
    expect(res.body.listing.wanted_categories).toEqual(["Sneakers", "Electronics"]);
  });

  it("ignores status and locationCity on PATCH — close via /sold or DELETE", async () => {
    const { accessToken } = await registerUser();
    const listing = await createListing(accessToken);

    const res = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "deleted",
        locationCity: "Elsewhere",
        title: "Still open",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Still open");
    expect(res.body.status).toBe("active");
  });

  it("does not deny or alter pending offers when fields are edited", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    await request(app)
      .patch(`/api/listings/${sellerListing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ title: "New Title After Offer", estimatedValueCents: 99900 });

    const offerRes = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(offerRes.body.status).toBe("pending");
    expect(offerRes.body.listing?.title).toBe("New Title After Offer");
  });

  it("returns 403 for non-owner and 400 for unknown categoryId", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const listing = await createListing(owner.accessToken);

    const forbidden = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${other.accessToken}`)
      .send({ title: "Nope" });
    expect(forbidden.status).toBe(403);

    const badCat = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ categoryId: "00000000-0000-4000-8000-000000000099" });
    expect(badCat.status).toBe(400);
  });

  it("edited estimatedValueCents surfaces on offer detail listing summary", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken, {
      estimatedValue: 50,
    });
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(
      buyer.accessToken,
      sellerListing.id,
      buyerListing.id,
    );

    await request(app)
      .patch(`/api/listings/${sellerListing.id}`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ estimatedValueCents: 77700 });

    const detail = await request(app)
      .get(`/api/offers/${offer.id}`)
      .set("Authorization", `Bearer ${buyer.accessToken}`);
    expect(detail.body.listing?.estimatedValueCents).toBe(77700);
    expect(
      detail.body.latestRound?.sellerItems?.[0]?.estimatedValueCents,
    ).toBe(77700);
  });
});
