import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import {
  registerUser,
  createListing,
  createOffer,
  acceptOffer,
} from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import {
  usersTable,
  offersTable,
  tradesTable,
  notificationsTable,
  listingsTable,
} from "../src/db/schema/index.js";
import { purgeUserAccount } from "../src/lib/account-deletion.js";
import { deleteUser } from "../src/lib/moderation-actions.js";

describe("purgeUserAccount", () => {
  it("removes user and pending offer on their listing; notifies buyer", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    const result = await purgeUserAccount(seller.user.id);
    expect(result.offersDeleted).toBe(1);

    const sellerRow = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.id, seller.user.id),
    });
    expect(sellerRow).toBeUndefined();

    const offerRow = await testDb.query.offersTable.findFirst({
      where: eq(offersTable.id, offer.id),
    });
    expect(offerRow).toBeUndefined();

    const buyerNotifs = await testDb.query.notificationsTable.findMany({
      where: eq(notificationsTable.userId, buyer.user.id),
    });
    expect(buyerNotifs.some((n) => n.type === "offer_denied")).toBe(true);

    const buyerStill = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.id, buyer.user.id),
    });
    expect(buyerStill).toBeTruthy();
  });

  it("removes user as buyer on another listing and notifies seller", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);

    await purgeUserAccount(buyer.user.id);

    const sellerNotifs = await testDb.query.notificationsTable.findMany({
      where: eq(notificationsTable.userId, seller.user.id),
    });
    expect(sellerNotifs.some((n) => n.body.includes("left Barter"))).toBe(true);

    const sellerListingRow = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, sellerListing.id),
    });
    expect(sellerListingRow?.status).toBe("active");
  });

  it("purges accepted trade; survivor listing stays active", async () => {
    const seller = await registerUser();
    const buyer = await registerUser();
    const sellerListing = await createListing(seller.accessToken);
    const buyerListing = await createListing(buyer.accessToken);
    const offer = await createOffer(buyer.accessToken, sellerListing.id, buyerListing.id);
    const trade = await acceptOffer(seller.accessToken, offer.id);

    await purgeUserAccount(seller.user.id);

    const tradeRow = await testDb.query.tradesTable.findFirst({
      where: eq(tradesTable.id, trade.id),
    });
    expect(tradeRow).toBeUndefined();

    const buyerListingRow = await testDb.query.listingsTable.findFirst({
      where: eq(listingsTable.id, buyerListing.id),
    });
    expect(buyerListingRow?.status).toBe("active");

    const buyerNotifs = await testDb.query.notificationsTable.findMany({
      where: eq(notificationsTable.userId, buyer.user.id),
    });
    expect(buyerNotifs.some((n) => n.type === "trade_cancelled")).toBe(true);
  });

  it("ops deleteUser delegates to the same purge", async () => {
    const user = await registerUser();
    await createListing(user.accessToken);

    const result = await deleteUser(user.user.id);
    expect(result.email).toBe(user.user.email);

    const gone = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.id, user.user.id),
    });
    expect(gone).toBeUndefined();
  });
});

describe("DELETE /api/account", () => {
  it("deletes authenticated user with confirm + password", async () => {
    const user = await registerUser();
    await createListing(user.accessToken);

    const res = await request(app)
      .delete("/api/account")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ confirm: true, password: user.password });

    expect(res.status).toBe(204);

    const gone = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.id, user.user.id),
    });
    expect(gone).toBeUndefined();
  });

  it("rejects without confirm", async () => {
    const user = await registerUser();

    const res = await request(app)
      .delete("/api/account")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ password: user.password });

    expect(res.status).toBe(400);
  });

  it("rejects wrong password", async () => {
    const user = await registerUser();

    const res = await request(app)
      .delete("/api/account")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ confirm: true, password: "WrongPassword1!" });

    expect(res.status).toBe(401);
  });

  it("requires auth", async () => {
    const res = await request(app)
      .delete("/api/account")
      .send({ confirm: true, password: "x" });

    expect(res.status).toBe(401);
  });
});
