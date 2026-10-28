import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { suggestListingFromImages } from "../lib/barter-ai.js";
import { CANONICAL_CATEGORIES, categoryIdBySlug } from "../lib/categories.js";
import { resolveRequestCountry } from "../lib/geo-country.js";
import { filterListingImageUrls } from "../lib/media.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/error.js";

const router = Router();

const suggestFromImagesBody = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(5),
  country: z.string().trim().min(2).max(2).optional(),
});

const suggestSkipRateLimit = () =>
  env.NODE_ENV === "development" || env.NODE_ENV === "test";

/** Cap total Gemini calls per user (cost / misuse). */
const suggestUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `suggest:user:${req.user?.sub ?? req.ip ?? "anon"}`,
  validate: false,
  skip: suggestSkipRateLimit,
  message: {
    error: "too_many_requests",
    message: "Too many AI draft requests this hour. Fill details manually or try later.",
  },
});

/** Same photo set spam — max 2 drafts per URL set per hour. */
const suggestPhotoSetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sub = req.user?.sub ?? req.ip ?? "anon";
    const urls = Array.isArray(req.body?.imageUrls)
      ? [...(req.body.imageUrls as unknown[])]
          .map((u) => String(u).trim())
          .filter(Boolean)
          .sort()
          .join("|")
      : "";
    return `suggest:photos:${sub}:${urls}`;
  },
  validate: false,
  skip: suggestSkipRateLimit,
  message: {
    error: "too_many_requests",
    message: "Already drafted from these photos. Change a photo or fill details manually.",
  },
});

// POST /api/listings/suggest-from-images
// Mount this router before listings so the path is not captured by /:listingId.
router.post(
  "/suggest-from-images",
  requireAuth,
  suggestUserLimiter,
  suggestPhotoSetLimiter,
  async (req, res, next) => {
    try {
      const parsed = suggestFromImagesBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "validation",
          message:
            parsed.error.issues.map((i) => i.message).join("; ") ||
            "Invalid suggest body",
        });
      }

      const imageUrls = filterListingImageUrls(parsed.data.imageUrls);
      if (imageUrls.length === 0) {
        return res.status(400).json({
          error: "validation",
          message: "imageUrls must include at least one public https URL",
        });
      }

      const country =
        parsed.data.country?.toUpperCase() ??
        resolveRequestCountry(req).country;

      const suggestion = await suggestListingFromImages({
        imageUrls,
        country,
        categoryCatalog: CANONICAL_CATEGORIES.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        })),
      });

      const categoryId =
        categoryIdBySlug(suggestion.categorySlug) ??
        categoryIdBySlug("others") ??
        CANONICAL_CATEGORIES[0]!.id;
      const categoryName =
        CANONICAL_CATEGORIES.find((c) => c.id === categoryId)?.name ?? "Others";

      const wantedCategoryIds = suggestion.wantedCategorySlugs
        .map((slug) => categoryIdBySlug(slug))
        .filter((id): id is string => Boolean(id));
      const wantedCategories = wantedCategoryIds.map(
        (id) => CANONICAL_CATEGORIES.find((c) => c.id === id)?.name ?? id,
      );

      return res.json({
        title: suggestion.title,
        description: suggestion.description,
        categoryId,
        category: categoryName,
        // Slugs let clients resolve against their local catalog UUIDs (DB ids
        // may differ from the canonical seed ids used above).
        categorySlug: suggestion.categorySlug,
        condition: suggestion.condition,
        brand: suggestion.brand,
        ageRange: suggestion.ageRange,
        estimatedValueCents: suggestion.estimatedValueCents,
        pricingRationale: suggestion.pricingRationale,
        wantedCategoryIds,
        wantedCategories,
        wantedCategorySlugs: suggestion.wantedCategorySlugs,
        wantedFreeText: suggestion.wantedFreeText,
        confidence: suggestion.confidence,
      });
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          error: err.code,
          message: err.message,
        });
      }
      next(err);
      return;
    }
  },
);

export default router;
