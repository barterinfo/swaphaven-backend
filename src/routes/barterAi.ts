import { Router } from "express";
import { ping, publicPing } from "../lib/barter-ai.js";

const router = Router();

/** Proxy barter-ai public GET /api/ping — for local/staging connectivity checks. */
router.get("/ping", async (_req, res, next) => {
  try {
    const result = await publicPing();
    if (result.skipped) {
      res.json({ configured: false, message: "BARTER_AI_URL is not set" });
      return;
    }
    res.json({ configured: true, barterAi: result });
  } catch (err) {
    next(err);
  }
});

/** Proxy barter-ai internal GET /api/internal/ping (server-to-server auth). */
router.get("/ping/internal", async (_req, res, next) => {
  try {
    const result = await ping();
    if (result.skipped) {
      res.json({ configured: false, message: "BARTER_AI_URL is not set" });
      return;
    }
    res.json({ configured: true, barterAi: result });
  } catch (err) {
    next(err);
  }
});

export default router;
