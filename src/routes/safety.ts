import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  userBlocksTable,
  contentReportsTable,
  usersTable,
  listingsTable,
  conversationsTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { p } from "../lib/route-helpers.js";
import { notifyContentReport } from "../lib/mailer.js";

const router = Router();

const reportReasonSchema = z.enum([
  "spam",
  "scam",
  "inappropriate",
  "harassment",
  "prohibited_item",
  "other",
]);

const createReportSchema = z.object({
  targetType: z.enum(["listing", "user", "conversation"]),
  targetId: z.string().uuid(),
  reason: reportReasonSchema,
  details: z.string().trim().max(1000).optional(),
});

// ─── POST /api/blocks/:userId ─────────────────────────────────────────────────
/** One-way block. Idempotent. Does not ban the other user on the platform. */
router.post("/blocks/:userId", requireAuth, async (req, res) => {
  const blockerId = req.user!.sub;
  const blockedId = p(req.params["userId"]);

  if (blockerId === blockedId) {
    return res.status(400).json({
      error: "bad_request",
      message: "Cannot block yourself",
    });
  }

  const target = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, blockedId),
    columns: { id: true },
  });
  if (!target) {
    return res.status(404).json({ error: "not_found", message: "User not found" });
  }

  const existing = await db.query.userBlocksTable.findFirst({
    where: and(
      eq(userBlocksTable.blockerId, blockerId),
      eq(userBlocksTable.blockedId, blockedId),
    ),
  });
  if (existing) {
    return res.status(200).json({
      id: existing.id,
      blockedUserId: blockedId,
      blocked: true,
    });
  }

  const [row] = await db
    .insert(userBlocksTable)
    .values({ blockerId, blockedId })
    .returning();

  return res.status(201).json({
    id: row!.id,
    blockedUserId: blockedId,
    blocked: true,
  });
});

// ─── DELETE /api/blocks/:userId ───────────────────────────────────────────────
/** Unblock. Idempotent. */
router.delete("/blocks/:userId", requireAuth, async (req, res) => {
  const blockerId = req.user!.sub;
  const blockedId = p(req.params["userId"]);

  await db
    .delete(userBlocksTable)
    .where(
      and(
        eq(userBlocksTable.blockerId, blockerId),
        eq(userBlocksTable.blockedId, blockedId),
      ),
    );

  return res.status(204).send();
});

// ─── GET /api/blocks ──────────────────────────────────────────────────────────
router.get("/blocks", requireAuth, async (req, res) => {
  const blockerId = req.user!.sub;
  const rows = await db
    .select({
      id: userBlocksTable.id,
      blockedUserId: userBlocksTable.blockedId,
      createdAt: userBlocksTable.createdAt,
    })
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, blockerId));

  return res.json({ items: rows });
});

// ─── POST /api/reports ────────────────────────────────────────────────────────
/**
 * Queue a content report for human review.
 * Does not hide content or ban anyone — status stays `pending` until ops act.
 */
router.post("/reports", requireAuth, async (req, res) => {
  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation",
      message: parsed.error.flatten().fieldErrors,
    });
  }

  const reporterId = req.user!.sub;
  const { targetType, targetId, reason, details } = parsed.data;

  let reportedUserId: string | null = null;

  if (targetType === "user") {
    if (targetId === reporterId) {
      return res.status(400).json({
        error: "bad_request",
        message: "Cannot report yourself",
      });
    }
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, targetId),
      columns: { id: true },
    });
    if (!user) {
      return res.status(404).json({ error: "not_found", message: "User not found" });
    }
    reportedUserId = user.id;
  } else if (targetType === "listing") {
    const listing = await db.query.listingsTable.findFirst({
      where: eq(listingsTable.id, targetId),
      columns: { id: true, userId: true },
    });
    if (!listing) {
      return res.status(404).json({ error: "not_found", message: "Listing not found" });
    }
    if (listing.userId === reporterId) {
      return res.status(400).json({
        error: "bad_request",
        message: "Cannot report your own listing",
      });
    }
    reportedUserId = listing.userId;
  } else {
    const conv = await db.query.conversationsTable.findFirst({
      where: eq(conversationsTable.id, targetId),
      with: { offer: { columns: { buyerId: true, sellerId: true } } },
    });
    if (!conv) {
      return res.status(404).json({ error: "not_found", message: "Conversation not found" });
    }
    const { buyerId, sellerId } = conv.offer;
    if (buyerId !== reporterId && sellerId !== reporterId) {
      return res.status(403).json({ error: "forbidden", message: "Not a participant" });
    }
    reportedUserId = buyerId === reporterId ? sellerId : buyerId;
  }

  const existing = await db.query.contentReportsTable.findFirst({
    where: and(
      eq(contentReportsTable.reporterId, reporterId),
      eq(contentReportsTable.targetType, targetType),
      eq(contentReportsTable.targetId, targetId),
    ),
  });
  if (existing) {
    return res.status(200).json({
      id: existing.id,
      status: existing.status,
      queued: true,
      message: "Thanks — we already have this report and will review it.",
    });
  }

  const [row] = await db
    .insert(contentReportsTable)
    .values({
      reporterId,
      targetType,
      targetId,
      reportedUserId: reportedUserId!,
      reason,
      details: details || null,
      status: "pending",
    })
    .returning();

  // Fire-and-forget notify — report is already queued even if mail fails.
  void notifyContentReport({
    reportId: row!.id,
    reporterId,
    reportedUserId: reportedUserId!,
    targetType,
    targetId,
    reason,
    details,
  });

  return res.status(201).json({
    id: row!.id,
    status: "pending",
    queued: true,
    message: "Thanks — we'll review this. No one is banned automatically.",
  });
});

export default router;
