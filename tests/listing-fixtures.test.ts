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
    const fixtures = generateListingFixtures(MAX_LISTING_FIXTURES);

    expect(fixtures).toHaveLength(MAX_LISTING_FIXTURES);

    for (const fixture of fixtures) {
      const payload = buildListingPayload(fixture);
      const parsed = createListingBodySchema.safeParse(payload);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.flatten())).toBe(
        true,
      );
    }
  });
});
