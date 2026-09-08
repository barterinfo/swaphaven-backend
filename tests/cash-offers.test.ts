import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { offerItemsTable, offerRoundItemsTable, offerRoundsTable } from "../src/db/schema/index.js";
import { computeCashOnlyMax } from "../src/lib/cash-only-quota.js";
import { env } from "../src/config/env.js";

describe("computeCashOnlyMax", () => {
  it("is free + listings + bonus", () => {
    expect(computeCashOnlyMax(1, 0, 0)).toBe(1);
    expect(computeCashOnlyMax(1, 4, 0)).toBe(5);
    expect(computeCashOnlyMax(1, 4, 2)).toBe(7);
    expect(computeCashOnlyMax(0, 0, 0)).toBe(0);
  });
});

describe("GET /api/cash-offers/quota", () => {
  it("returns starter quota with zero listings", async () => {
    const buyer = await registerUser();

    const res = await request(app)
      .get("/api/cash-offers/quota")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.used).toBe(0);
    expect(res.body.activeListingCount).toBe(0);
    expect(res.body.freeOffers).toBe(env.CASH_ONLY_FREE_OFFERS);
    expect(res.body.bonusOffers).toBe(env.CASH_ONLY_BONUS_OFFERS);
    expect(res.body.max).toBe(
      env.CASH_ONLY_FREE_OFFERS + env.CASH_ONLY_BONUS_OFFERS,
    );
    expect(res.body.remaining).toBe(res.body.max);
  });

  it("increases max with active listings", async () => {
    const buyer = await registerUser();
    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);

    const res = await request(app)
      .get("/api/cash-offers/quota")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.activeListingCount).toBe(4);
    expect(res.body.max).toBe(
      env.CASH_ONLY_FREE_OFFERS + 4 + env.CASH_ONLY_BONUS_OFFERS,
    );
  });
});

describe("POST /api/cash-offers", () => {
  it("creates a cash-only offer with no buyer items", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);

    const res = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, cashTopUpCents: 4500 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.cashTopUpCents).toBe(4500);
    expect(res.body.buyerId).toBe(buyer.user.id);

    const items = await testDb.query.offerItemsTable.findMany({
      where: eq(offerItemsTable.offerId, res.body.id),
    });
    expect(items).toHaveLength(0);

    const round = await testDb.query.offerRoundsTable.findFirst({
      where: eq(offerRoundsTable.offerId, res.body.id),
      with: { items: true },
    });
    expect(round?.buyerCashTopUpCents).toBe(4500);
    const buyerSide = (round?.items ?? []).filter((i) => i.side === "buyer");
    const sellerSide = (round?.items ?? []).filter((i) => i.side === "seller");
    expect(buyerSide).toHaveLength(0);
    expect(sellerSide).toHaveLength(1);
    expect(sellerSide[0]!.listingId).toBe(sellerListing.id);
  });

  it("rejects cashTopUpCents of zero", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);

    const res = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: sellerListing.id, cashTopUpCents: 0 });

    expect(res.status).toBe(400);
  });

  it("blocks a second cash-only offer when closet is empty (quota)", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing1 = await createListing(seller.accessToken);
    const listing2 = await createListing(seller.accessToken);

    const first = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing1.id, cashTopUpCents: 2000 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing2.id, cashTopUpCents: 3000 });

    expect(second.status).toBe(403);
    expect(second.body.error).toBe("cash_only_quota");
  });

  it("allows a second cash-only offer after buyer lists items", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing1 = await createListing(seller.accessToken);
    const listing2 = await createListing(seller.accessToken);

    const first = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing1.id, cashTopUpCents: 2000 });
    expect(first.status).toBe(201);

    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);
    await createListing(buyer.accessToken);

    const second = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing2.id, cashTopUpCents: 3000 });

    expect(second.status).toBe(201);
  });

  it("does not count hybrid item offers toward cash-only used", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);

    const hybrid = await request(app)
      .post("/api/offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({
        listingId: sellerListing.id,
        offeredListingIds: [buyerListing.id],
        cashTopUpCents: 1000,
      });
    expect(hybrid.status).toBe(201);

    const quota = await request(app)
      .get("/api/cash-offers/quota")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(quota.status).toBe(200);
    expect(quota.body.used).toBe(0);
  });

  it("still counts withdrawn cash-only offers toward used", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    const created = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 1500 });
    expect(created.status).toBe(201);

    await request(app)
      .post(`/api/offers/${created.body.id}/withdraw`)
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .expect(204);

    const quota = await request(app)
      .get("/api/cash-offers/quota")
      .set("Authorization", `Bearer ${buyer.accessToken}`);

    expect(quota.body.used).toBe(1);
    expect(quota.body.remaining).toBe(
      Math.max(0, quota.body.max - 1),
    );
  });

  it("accepts a cash-only offer via existing accept endpoint", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    const created = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 4000 });
    expect(created.status).toBe(201);

    const accepted = await request(app)
      .post(`/api/offers/${created.body.id}/accept`)
      .set("Authorization", `Bearer ${seller.accessToken}`);

    expect(accepted.status).toBe(200);
    expect(accepted.body.conversationId).toBeTruthy();
  });
});

describe("POST /api/cash-offers/:offerId/counter", () => {
  it("allows the seller to counter with a higher cash amount", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    const created = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 4000 });
    expect(created.status).toBe(201);

    const counter = await request(app)
      .post(`/api/cash-offers/${created.body.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ buyerCashTopUpCents: 5000 });

    expect(counter.status).toBe(201);
    expect(counter.body.buyerCashTopUpCents).toBe(5000);
    expect(counter.body.roundNumber).toBe(2);

    const roundItems = await testDb.query.offerRoundItemsTable.findMany({
      where: eq(offerRoundItemsTable.offerRoundId, counter.body.id),
    });
    expect(roundItems.every((i) => i.side === "seller")).toBe(true);
    expect(roundItems.some((i) => i.side === "buyer")).toBe(false);
  });

  it("rejects counter with zero cash on both sides", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const listing = await createListing(seller.accessToken);

    const created = await request(app)
      .post("/api/cash-offers")
      .set("Authorization", `Bearer ${buyer.accessToken}`)
      .send({ listingId: listing.id, cashTopUpCents: 4000 });
    expect(created.status).toBe(201);

    const counter = await request(app)
      .post(`/api/cash-offers/${created.body.id}/counter`)
      .set("Authorization", `Bearer ${seller.accessToken}`)
      .send({ buyerCashTopUpCents: 0, sellerCashRequestedCents: 0 });

    expect(counter.status).toBe(400);
  });
});
