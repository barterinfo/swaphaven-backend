import { describe, it, expect } from "vitest";
import { fetchRightSwipeCounts } from "../src/lib/right-swipe-count.js";
import { registerUser, createListing } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { swipesTable } from "../src/db/schema/index.js";

describe("fetchRightSwipeCounts", () => {
  it("counts only right swipes per listing and omits listings with none", async () => {
    const owner = await registerUser();
    const swiper1 = await registerUser();
    const swiper2 = await registerUser();
    const swiper3 = await registerUser();

    const listingA = await createListing(owner.accessToken);
    const listingB = await createListing(owner.accessToken);
    const listingC = await createListing(owner.accessToken);

    await testDb.insert(swipesTable).values([
      { swiperId: swiper1.user.id, listingId: listingA.id, direction: "right" },
      { swiperId: swiper2.user.id, listingId: listingA.id, direction: "right" },
      { swiperId: swiper3.user.id, listingId: listingA.id, direction: "left" },
      { swiperId: swiper1.user.id, listingId: listingB.id, direction: "right" },
      { swiperId: swiper2.user.id, listingId: listingC.id, direction: "left" },
    ]);

    const counts = await fetchRightSwipeCounts([listingA.id, listingB.id, listingC.id]);
    expect(counts.get(listingA.id)).toBe(2);
    expect(counts.get(listingB.id)).toBe(1);
    expect(counts.has(listingC.id)).toBe(false);
  });

  it("returns an empty map when given no listing IDs", async () => {
    const counts = await fetchRightSwipeCounts([]);
    expect(counts.size).toBe(0);
  });
});
