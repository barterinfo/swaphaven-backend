import { Router } from "express";
import { and, eq, lt, ne, isNull, inArray, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { conversationsTable, messagesTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { broadcastToRoom } from "../lib/ws.js";
import { serializeConversationListItem } from "../lib/inbox-serializers.js";

const router = Router();

// ─── GET /api/conversations ───────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const userId = req.user!.sub;

  const items = await db.query.conversationsTable.findMany({
    with: {
      offer: {
        columns: { id: true, status: true, buyerId: true, sellerId: true },
        with: {
          listing: { columns: { id: true, title: true }, with: { images: true } },
          items: { with: { listing: { columns: { id: true, title: true }, with: { images: true } } } },
          buyer: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
          seller: { columns: { id: true, name: true }, with: { profile: { columns: { displayName: true, avatarUrl: true, isVerified: true } } } },
          trade: true,
        },
      },
      messages: { limit: 1, orderBy: (t, { desc }) => [desc(t.createdAt)] },
    },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  const visible = items.filter(
    (c) => c.offer.buyerId === userId || c.offer.sellerId === userId,
  );

  // Per-conversation unread counts (messages from the other party not yet read).
  const unreadByConversation = new Map<string, number>();
  if (visible.length > 0) {
    const rows = await db
      .select({ conversationId: messagesTable.conversationId, unread: count() })
      .from(messagesTable)
      .where(and(
        inArray(messagesTable.conversationId, visible.map((c) => c.id)),
        ne(messagesTable.senderId, userId),
        isNull(messagesTable.readAt),
      ))
      .groupBy(messagesTable.conversationId);
    for (const row of rows) unreadByConversation.set(row.conversationId, Number(row.unread));
  }

  const serialized = visible.map((c) =>
    serializeConversationListItem(c, userId, unreadByConversation.get(c.id) ?? 0),
  );
  const nextCursor = visible.length === limit ? encodeCursor(visible.at(-1)!.createdAt) : null;
  return res.json({ items: serialized, nextCursor });
});

// ─── GET /api/conversations/:conversationId ───────────────────────────────────
router.get("/:conversationId", requireAuth, async (req, res) => {
  const convId = req.params["conversationId"] as string;
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, convId),
    with: { offer: true },
  });
  if (!conv) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (conv.offer.buyerId !== userId && conv.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }
  return res.json(conv);
});

// ─── GET /api/conversations/:conversationId/messages ──────────────────────────
router.get("/:conversationId/messages", requireAuth, async (req, res) => {
  const convId = req.params["conversationId"] as string;
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, convId),
    with: { offer: { columns: { buyerId: true, sellerId: true } } },
  });
  if (!conv) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (conv.offer.buyerId !== userId && conv.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
  const conditions = [eq(messagesTable.conversationId, convId)];
  if (cursor) conditions.push(lt(messagesTable.createdAt, cursor) as typeof conditions[0]);

  const items = await db.query.messagesTable.findMany({
    where: and(...conditions),
    with: { sender: { columns: { id: true, displayName: true, avatarUrl: true } } },
    limit,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  const nextCursor = items.length === limit ? encodeCursor(items.at(-1)!.createdAt) : null;
  return res.json({ items, nextCursor });
});

// ─── POST /api/conversations/:conversationId/messages ─────────────────────────
const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000),
  type: z.enum(["text", "image"]).default("text"),
});

router.post("/:conversationId/messages", requireAuth, async (req, res) => {
  const convId = req.params["conversationId"] as string;
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, convId),
    with: { offer: { columns: { buyerId: true, sellerId: true } } },
  });
  if (!conv) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (conv.offer.buyerId !== userId && conv.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation", message: parsed.error.flatten().fieldErrors });
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: convId,
      senderId: userId,
      ...parsed.data,
    })
    .returning();

  broadcastToRoom(convId, { event: "new_message", message });
  return res.status(201).json(message);
});

// ─── PATCH /api/conversations/:conversationId/read ────────────────────────────
// Marks all messages from the other participant as read, clearing the unread badge.
router.patch("/:conversationId/read", requireAuth, async (req, res) => {
  const convId = req.params["conversationId"] as string;
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, convId),
    with: { offer: { columns: { buyerId: true, sellerId: true } } },
  });
  if (!conv) return res.status(404).json({ error: "not_found" });

  const userId = req.user!.sub;
  if (conv.offer.buyerId !== userId && conv.offer.sellerId !== userId) {
    return res.status(403).json({ error: "forbidden" });
  }

  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(messagesTable.conversationId, convId),
      ne(messagesTable.senderId, userId),
      isNull(messagesTable.readAt),
    ));

  return res.status(204).send();
});

export default router;
