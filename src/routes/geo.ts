import { Router } from "express";
import { resolveRequestGeo } from "../lib/geo-country.js";

const router = Router();

/**
 * GET /api/geo/me
 * Approximate country/city for the request IP — used when the client denies GPS.
 * No auth required; does not persist anything.
 */
router.get("/me", (req, res) => {
  const geo = resolveRequestGeo(req);
  return res.json(geo);
});

export default router;
