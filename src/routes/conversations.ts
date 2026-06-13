import { Router } from "express";
import { and, eq, lt, ne, isNull, inArray, count, or, desc, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { conversationsTable, messagesTable, offersTable, userProfilesTable } from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { parsePaginationQuery, encodeCursor } from "../lib/paginate.js";
import { broadcastToRoom } from "../lib/ws.js";
import { serializeConversationListItem } from "../lib/inbox-serializers.js";
import { sendPushToUser } from "../lib/push.js";

const router = Router();

// ─── GET /api/conversations ───────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const { limit, cursor } = parsePaginationQuery(req.query as Record<string, unknown>);
  const userId = req.user!.sub;

  const lastMsgSq = db
    .select({
      conversationId: messagesTable.conversationId,
      lastAt: max(messagesTable.createdAt).as("lastAt"),
    })
    .from(messagesTable)
    .groupBy(messagesTable.conversationId)
    .as("lm");

  const sortAt = sql<Date>`COALESCE(${lastMsgSq.lastAt}, ${conversationsTable.createdAt})`;

  const conditions = [
    or(eq(offersTable.buyerId, userId), eq(offersTable.sellerId, userId)),
  ];
  if (cursor) conditions.push(lt(sortAt, cursor));

  const idRows = await db
    .select({ id: conversationsTable.id, sortAt })
    .from(conversationsTable)
    .innerJoin(offersTable, eq(conversationsTable.offerId, offersTable.id))
    .leftJoin(lastMsgSq, eq(conversationsTable.id, lastMsgSq.conversationId))
    .where(and(...conditions))
    .orderBy(desc(sortAt))
    .limit(limit);

  if (idRows.length === 0) {
    return res.json({ items: [], nextCursor: null });
  }

  const convIds = idRows.map((r) => r.id);
  const orderIndex = new Map(convIds.map((id, i) => [id, i]));

  const items = await db.query.conversationsTable.findMany({
    where: inArray(conversationsTable.id, convIds),
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
  });
  items.sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);

  const unreadByConversation = new Map<string, number>();
  const rows = await db
    .select({ conversationId: messagesTable.conversationId, unread: count() })
    .from(messagesTable)
    .where(and(
      inArray(messagesTable.conversationId, convIds),
      ne(messagesTable.senderId, userId),
      isNull(messagesTable.readAt),
    ))
    .groupBy(messagesTable.conversationId);
  for (const row of rows) unreadByConversation.set(row.conversationId, Number(row.unread));

  const serialized = items.map((c) =>
    serializeConversationListItem(c, userId, unreadByConversation.get(c.id) ?? 0),
  );
  const lastSortAt = idRows.at(-1)!.sortAt;
  const nextCursor = idRows.length === limit
    ? encodeCursor(lastSortAt instanceof Date ? lastSortAt : new Date(lastSortAt))
    : null;
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
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
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

  // Push to the other participant only when they are not connected via WS
  // (broadcastToRoom already delivers to open sockets). We send regardless
  // because FCM will suppress the notification if the app is in the foreground
  // on the device — iOS/Android handle that deduplication natively.
  const otherUserId =
    conv.offer.buyerId === userId ? conv.offer.sellerId : conv.offer.buyerId;
  const messageBody = parsed.data.body;

  void (async () => {
    const senderProfile = await db.query.userProfilesTable.findFirst({
      where: eq(userProfilesTable.id, userId),
      columns: { displayName: true },
    });
    await sendPushToUser(otherUserId, {
      title: senderProfile?.displayName ?? "Someone",
      body: messageBody.length > 100 ? `${messageBody.slice(0, 100)}…` : messageBody,
      data: { type: "new_message", conversationId: convId },
    });
  })().catch(console.error);

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
