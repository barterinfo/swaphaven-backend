import { Router } from "express";
import { z } from "zod";
import { optionalAuth } from "../middleware/auth.js";
import { searchListings } from "../search/queries.js";
import type { SearchSort } from "../search/types.js";

const router = Router();

const conditionEnum = z.enum(["new", "like_new", "great", "good", "fair"]);
const sortEnum = z.enum([
  "best_match",
  "nearest",
  "newest",
  "value_asc",
  "most_saved",
]);

const searchListingsQuerySchema = z.object({
  q: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(25).optional(),
  condition: z.string().optional(),
  category: z.string().optional(),
  sort: sortEnum.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  /** Phase 2 affinity hook — accepted, ignored in Phase 1. */
  seed_ids: z.string().optional(),
});

const trendingQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(1).max(25).optional(),
  limit: z.coerce.number().int().min(1).max(40).optional().default(8),
});

function parseConditions(raw: string | undefined): Array<z.infer<typeof conditionEnum>> {
  if (!raw) return [];
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const out: Array<z.infer<typeof conditionEnum>> = [];
  for (const part of parts) {
    const parsed = conditionEnum.safeParse(part);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function parseSeedIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function defaultSort(q: string | undefined, lat?: number, lng?: number): SearchSort {
  const hasQ = Boolean(q && q.trim().replace(/\s+/g, " ").length >= 2);
  if (hasQ) return "best_match";
  if (lat != null && lng != null) return "nearest";
  return "newest";
}

// ─── GET /api/search/listings ─────────────────────────────────────────────────
router.get("/listings", optionalAuth, async (req, res) => {
  const parsed = searchListingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid query",
    });
  }

  const q = parsed.data;
  const sort = q.sort ?? defaultSort(q.q, q.lat, q.lng);

  const result = await searchListings({
    q: q.q,
    lat: q.lat,
    lng: q.lng,
    radius: q.radius,
    conditions: parseConditions(q.condition),
    category: q.category,
    sort,
    limit: q.limit,
    offset: q.offset,
    excludeUserId: req.user?.sub,
    seedIds: parseSeedIds(q.seed_ids),
  });

  return res.json(result);
});

// ─── GET /api/search/trending ─────────────────────────────────────────────────
// Active trending *items* (by right-swipe / save signal), not search keywords.
router.get("/trending", optionalAuth, async (req, res) => {
  const parsed = trendingQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: parsed.error.issues[0]?.message ?? "Invalid query",
    });
  }

  const q = parsed.data;
  const result = await searchListings({
    lat: q.lat,
    lng: q.lng,
    // Soft nearby preference when location is present, but do not hard-filter
    // by radius so the trending carousel stays populated.
    radius: undefined,
    sort: "most_saved",
    limit: q.limit,
    offset: 0,
    excludeUserId: req.user?.sub,
  });

  return res.json({
    listings: result.listings,
    total: result.total,
  });
});

export default router;
