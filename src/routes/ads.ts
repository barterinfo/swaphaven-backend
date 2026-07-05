import { Router } from "express";
import { and, eq, or, isNull, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { sponsoredAdsTable } from "../db/schema/index.js";

const router = Router();

// ─── GET /api/ads/active ──────────────────────────────────────────────────────
// Returns curated sponsored cards to interleave into the swipe deck.
// Public: no auth required — this is display-only data with no PII and is
// safe to serve from a CDN in front of the API if traffic warrants it later.
// Filters:
//   - active = true
//   - (starts_at IS NULL OR starts_at <= now())
//   - (ends_at   IS NULL OR ends_at   >  now())
// Response is intentionally camelCase and matches the mobile DTO.
router.get("/active", async (_req, res) => {
  const now = new Date();

  const rows = await db
    .select({
      id:                 sponsoredAdsTable.id,
      sponsorName:        sponsoredAdsTable.sponsorName,
      tagline:            sponsoredAdsTable.tagline,
      ctaLabel:           sponsoredAdsTable.ctaLabel,
      ctaColor:           sponsoredAdsTable.ctaColor,
      ctaUrl:             sponsoredAdsTable.ctaUrl,
      backgroundImageUrl: sponsoredAdsTable.backgroundImageUrl,
      weight:             sponsoredAdsTable.weight,
    })
    .from(sponsoredAdsTable)
    .where(and(
      eq(sponsoredAdsTable.active, true),
      or(isNull(sponsoredAdsTable.startsAt), lt(sponsoredAdsTable.startsAt, now)),
      or(isNull(sponsoredAdsTable.endsAt),   gt(sponsoredAdsTable.endsAt,   now)),
    ))
    // Higher-weight campaigns rotate first; stable secondary sort by id for
    // deterministic client-side pagination if we ever add it.
    .orderBy(sql`${sponsoredAdsTable.weight} DESC`, sponsoredAdsTable.id);

  return res.json({ ads: rows });
});

export default router;
