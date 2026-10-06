import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  cancelPendingOutboxForUser,
  upsertPresence,
} from "../lib/activity-email/gates.js";

const router = Router();

const heartbeatSchema = z.object({
  state: z.enum(["foreground", "background"]),
  pushEnabled: z.boolean(),
});

// ─── POST /api/presence/heartbeat ─────────────────────────────────────────────
router.post("/heartbeat", requireAuth, async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const userId = req.user!.sub;
  const isForeground = parsed.data.state === "foreground";

  await upsertPresence({
    userId,
    isForeground,
    pushEnabled: parsed.data.pushEnabled,
  });

  // Coming online cancels pending fallback emails (user will see in-app feed).
  if (isForeground) {
    await cancelPendingOutboxForUser(userId);
  }

  return res.status(204).send();
});

export default router;
