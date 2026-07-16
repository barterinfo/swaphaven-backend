/** Sealed peer-review window duration after a trade is marked completed. */
export const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type ReviewWindowTrade = {
  reviewWindowClosesAt: Date | string | null;
  completedAt: Date | string | null;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Prefer the stored close timestamp; otherwise derive completedAt + 7 days.
 * Handles completed trades that never got `review_window_closes_at` backfilled.
 */
export function resolveReviewWindowClosesAt(trade: ReviewWindowTrade): Date | null {
  if (trade.reviewWindowClosesAt != null) {
    return asDate(trade.reviewWindowClosesAt);
  }
  if (trade.completedAt != null) {
    return new Date(asDate(trade.completedAt).getTime() + REVIEW_WINDOW_MS);
  }
  return null;
}

/** True while reviews may still be submitted. */
export function isReviewWindowOpen(trade: ReviewWindowTrade, now = new Date()): boolean {
  const closesAt = resolveReviewWindowClosesAt(trade);
  return closesAt != null && closesAt > now;
}
