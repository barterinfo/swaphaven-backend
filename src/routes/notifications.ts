import { Router } from "express";
import { and, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { notificationsTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { p } from "../lib/route-helpers.js";

const router = Router();

// ─── GET /api/notifications ───────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { unreadOnly } = req.query as { unreadOnly?: string };

  const conditions: SQL<unknown>[] = [eq(notificationsTable.userId, req.user!.sub)];
  if (unreadOnly === "true") conditions.push(eq(notificationsTable.isRead, false));

  const items = await db.query.notificationsTable.findMany({
    where: and(...conditions),
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

// ─── PATCH /api/notifications/:notificationId/read ────────────────────────────
router.patch("/:notificationId/read", requireAuth, async (req, res) => {
  const notifId = p(req.params["notificationId"]);
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(
      eq(notificationsTable.id, notifId),
      eq(notificationsTable.userId, req.user!.sub),
    ));
  return res.status(204).send();
});

// ─── POST /api/notifications/read-all ────────────────────────────────────────
router.post("/read-all", requireAuth, async (req, res) => {
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.userId, req.user!.sub));
  return res.status(204).send();
});

export default router;
