import { Router } from "express";
import { and, eq, or, isNull, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { sponsoredAdsTable } from "../db/schema/index.js";
import { isUuid } from "../lib/barter-listing.js";
import { p } from "../lib/route-helpers.js";

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

// ─── POST /api/ads/:id/click ──────────────────────────────────────────────────
// Records a CTA engagement (button tap or right-swipe on an ad card).
// Public: no auth required — same trust model as GET /active.
// Responds immediately with 204; the increment is fire-and-forget so the
// browser/deep-link handoff is never blocked.
router.post("/:id/click", (req, res) => {
  const id = p(req.params["id"]);
  if (!isUuid(id)) {
    res.status(400).json({ error: "Invalid ad id" });
    return;
  }

  res.status(204).send();

  db.update(sponsoredAdsTable)
    .set({
      clickCount: sql`${sponsoredAdsTable.clickCount} + 1`,
      updatedAt:  new Date(),
    })
    .where(eq(sponsoredAdsTable.id, id))
    .catch(console.error);
});

// ─── POST /api/ads/:id/impression ─────────────────────────────────────────────
// Records that an ad card reached the top of the swipe deck.
// Public: no auth required. Responds with 204 immediately; increment is async.
router.post("/:id/impression", (req, res) => {
  const id = p(req.params["id"]);
  if (!isUuid(id)) {
    res.status(400).json({ error: "Invalid ad id" });
    return;
  }

  res.status(204).send();

  db.update(sponsoredAdsTable)
    .set({
      impressionCount: sql`${sponsoredAdsTable.impressionCount} + 1`,
      updatedAt:       new Date(),
    })
    .where(eq(sponsoredAdsTable.id, id))
    .catch(console.error);
});

export default router;
