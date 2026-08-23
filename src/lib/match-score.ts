import { CANONICAL_CATEGORIES } from "./categories.js";

export const OPEN_TO_ANY_MATCH_REASON =
  "They're open to any category, and you have items to trade.";

export type MatchScoreResult = {
  mutualFitScore: number;
  matchedWantedLabels: string[];
  matchReason: string | null;
};

const CANONICAL_NAMES_LOWER = CANONICAL_CATEGORIES.map((c) =>
  c.name.trim().toLowerCase(),
);

/** True when wanted labels cover every canonical category name. */
export function isOpenToAnyCategory(wantedCategories: string[]): boolean {
  if (wantedCategories.length === 0) return false;
  const wanted = new Set(
    wantedCategories.map((w) => w.trim().toLowerCase()).filter(Boolean),
  );
  return CANONICAL_NAMES_LOWER.every((name) => wanted.has(name));
}

/**
 * Mutual-fit score from the seller's wanted categories vs the viewer's
 * active listing categories (what they can offer).
 *
 * Full-catalog ("open to any") wanted lists collapse to score 1 with a short
 * reason when the viewer has at least one listing — otherwise the UI would
 * list every overlapping closet category.
 */
export function computeMatchScore(
  wantedCategories: string[],
  myOfferCategories: Set<string>,
): MatchScoreResult {
  if (!wantedCategories.length || !myOfferCategories.size) {
    return { mutualFitScore: 0, matchedWantedLabels: [], matchReason: null };
  }

  if (isOpenToAnyCategory(wantedCategories)) {
    return {
      mutualFitScore: 1,
      matchedWantedLabels: [],
      matchReason: OPEN_TO_ANY_MATCH_REASON,
    };
  }

  const matched = wantedCategories.filter((w) =>
    myOfferCategories.has(w.trim().toLowerCase()),
  );
  const score = matched.length / wantedCategories.length;
  const reason =
    matched.length > 0 ? `You have items in: ${matched.join(", ")}` : null;
  return {
    mutualFitScore: score,
    matchedWantedLabels: matched,
    matchReason: reason,
  };
}
