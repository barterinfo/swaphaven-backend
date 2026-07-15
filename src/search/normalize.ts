const MAX_TOKENS = 8;

/** Trim, collapse whitespace, lowercase. */
export function normalizeQuery(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Tokenize a normalized query for AND matching.
 * Drops tokens shorter than 2 chars; caps at [MAX_TOKENS].
 */
export function tokenizeQuery(normalized: string): string[] {
  if (normalized.length < 2) return [];
  const tokens = normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, MAX_TOKENS);
  return tokens;
}
