import { Router } from "express";
import { and, eq, ne, or, isNull, inArray, count } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  offersTable, conversationsTable, messagesTable,
} from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ─── GET /api/inbox/summary ───────────────────────────────────────────────────
// Lightweight counts for the nav badge so the client makes one call instead of
// hitting offers + conversations separately.
router.get("/summary", requireAuth, async (req, res) => {
  const userId = req.user!.sub;

  const [actionNeededRow] = await db
    .select({ value: count() })
    .from(offersTable)
    .where(or(
      and(eq(offersTable.sellerId, userId), eq(offersTable.status, "pending")),
      and(eq(offersTable.buyerId, userId), eq(offersTable.status, "countered")),
    ));

  // Conversations the user participates in (as buyer or seller of the offer).
  const conversations = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .innerJoin(offersTable, eq(conversationsTable.offerId, offersTable.id))
    .where(or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)));

  let unreadMessages = 0;
  if (conversations.length > 0) {
    const [unreadRow] = await db
      .select({ value: count() })
      .from(messagesTable)
      .where(and(
        inArray(messagesTable.conversationId, conversations.map((c) => c.id)),
        ne(messagesTable.senderId, userId),
        isNull(messagesTable.readAt),
      ));
    unreadMessages = Number(unreadRow?.value ?? 0);
  }

  const actionNeededOffers = Number(actionNeededRow?.value ?? 0);
  return res.json({
    actionNeededOffers,
    unreadMessages,
    total: actionNeededOffers + unreadMessages,
  });
});

export default router;
