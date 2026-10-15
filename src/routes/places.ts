import { Router } from "express";
import { z } from "zod";
import { fetchPlaceSuggestions } from "../lib/place-suggestions.js";
import { normalizeCountryCode } from "../lib/geo-country.js";

const router = Router();

const suggestionsQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  country: z.string().trim().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(15).optional().default(8),
});

/**
 * GET /api/places/suggestions
 * Selectable place rows for onboarding and create-listing. Units are omitted;
 * blocks come back as the surrounding area name.
 */
router.get("/suggestions", async (req, res) => {
  const parsed = suggestionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  const country = normalizeCountryCode(parsed.data.country);
  try {
    const suggestions = await fetchPlaceSuggestions({
      query: parsed.data.q,
      countryCode: country,
      limit: parsed.data.limit,
    });
    return res.json({ suggestions });
  } catch (err) {
    console.error("[places/suggestions]", err);
    return res.status(502).json({
      error: "upstream",
      message: "Could not load place suggestions. Try again.",
    });
  }
});

export default router;
