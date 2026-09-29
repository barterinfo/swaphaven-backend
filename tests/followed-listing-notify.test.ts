import { describe, it, expect } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, createListing } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { notificationsTable } from "../src/db/schema/index.js";

describe("followed listing notifications", () => {
  it("notifies followers when a followed user creates a listing", async () => {
    const follower = await registerUser();
    const seller = await registerUser();

    await request(app)
      .post(`/api/users/${seller.user.id}/follow`)
      .set("Authorization", `Bearer ${follower.accessToken}`)
      .expect(201);

    const listing = await createListing(seller.accessToken, {
      title: "Vintage Camera",
    });

    // Fan-out is fire-and-forget; poll briefly for the notification row.
    let rows: { type: string; relatedListingId: string | null; body: string }[] = [];
    for (let i = 0; i < 20; i++) {
      rows = await testDb
        .select({
          type: notificationsTable.type,
          relatedListingId: notificationsTable.relatedListingId,
          body: notificationsTable.body,
        })
        .from(notificationsTable)
        .where(eq(notificationsTable.userId, follower.user.id));
      if (rows.length) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("followed_listing");
    expect(rows[0]!.relatedListingId).toBe(listing.id);
    expect(rows[0]!.body).toContain("Vintage Camera");
  });

  it("does not notify when the viewer does not follow the seller", async () => {
    const stranger = await registerUser();
    const seller = await registerUser();
    await createListing(seller.accessToken, { title: "Quiet Item" });

    await new Promise((r) => setTimeout(r, 100));

    const rows = await testDb
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, stranger.user.id));

    expect(rows).toHaveLength(0);
  });
});
