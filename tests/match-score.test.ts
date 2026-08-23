import { describe, expect, it } from "vitest";
import { CANONICAL_CATEGORIES } from "../src/lib/categories.js";
import {
  OPEN_TO_ANY_MATCH_REASON,
  computeMatchScore,
  isOpenToAnyCategory,
} from "../src/lib/match-score.js";

describe("isOpenToAnyCategory", () => {
  it("is true when every canonical name is present", () => {
    expect(
      isOpenToAnyCategory(CANONICAL_CATEGORIES.map((c) => c.name)),
    ).toBe(true);
  });

  it("is false for a partial list", () => {
    expect(isOpenToAnyCategory(["Electronics", "Books"])).toBe(false);
  });
});

describe("computeMatchScore", () => {
  it("collapses full-catalog wanted + viewer listings to score 1", () => {
    const result = computeMatchScore(
      CANONICAL_CATEGORIES.map((c) => c.name),
      new Set(["electronics", "clothing", "books"]),
    );
    expect(result.mutualFitScore).toBe(1);
    expect(result.matchedWantedLabels).toEqual([]);
    expect(result.matchReason).toBe(OPEN_TO_ANY_MATCH_REASON);
  });

  it("keeps overlap scoring for specific wanted lists", () => {
    const result = computeMatchScore(
      ["Electronics", "Books", "Cameras"],
      new Set(["electronics", "books"]),
    );
    expect(result.mutualFitScore).toBeCloseTo(2 / 3);
    expect(result.matchedWantedLabels).toEqual(["Electronics", "Books"]);
    expect(result.matchReason).toBe("You have items in: Electronics, Books");
  });

  it("returns zero when the viewer has nothing to offer", () => {
    const result = computeMatchScore(
      CANONICAL_CATEGORIES.map((c) => c.name),
      new Set(),
    );
    expect(result).toEqual({
      mutualFitScore: 0,
      matchedWantedLabels: [],
      matchReason: null,
    });
  });
});
