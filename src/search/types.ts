export type SearchSort =
  | "best_match"
  | "nearest"
  | "newest"
  | "value_asc"
  | "most_saved";

export type SearchListingParams = {
  q?: string;
  lat?: number;
  lng?: number;
  /** Max distance in miles (hard filter when set with lat/lng). */
  radius?: number;
  conditions?: Array<"like_new" | "great" | "good" | "fair" | "new">;
  category?: string;
  sort: SearchSort;
  limit: number;
  offset: number;
  /** Authenticated user id — own listings excluded when set. */
  excludeUserId?: string;
  /** Phase 2 hook — accepted and ignored in Phase 1. */
  seedIds?: string[];
};
