import { describe, expect, it } from "vitest";
import {
  buildListingPayload,
  createListingBodySchema,
} from "../src/lib/barter-listing.js";
import {
  generateListingFixtures,
  MAX_LISTING_FIXTURES,
} from "../scripts/listing-fixtures.js";

describe("listing fixtures", () => {
  it("generates payloads that satisfy createListingBodySchema", () => {
    const fixtures = generateListingFixtures(14);

    expect(fixtures).toHaveLength(14);

    for (const fixture of fixtures) {
      const payload = buildListingPayload(fixture);
      const parsed = createListingBodySchema.safeParse(payload);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.flatten())).toBe(
        true,
      );
    }
  });

  it("cycles templates when count exceeds the catalog size", () => {
    const fixtures = generateListingFixtures(100);
    expect(fixtures).toHaveLength(100);
    expect(new Set(fixtures.map((f) => f.imageSeed)).size).toBe(100);
    expect(fixtures.every((f) => f.location.country === "SG")).toBe(true);
    expect(MAX_LISTING_FIXTURES).toBeGreaterThanOrEqual(100);
  });
});
