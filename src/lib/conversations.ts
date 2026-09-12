import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  conversationsTable,
  offersTable,
  usersTable,
} from "../db/schema/index.js";

export const CONVERSATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isConversationId(value: string): boolean {
  return CONVERSATION_ID.test(value);
}

export type ConversationParticipants = {
  id: string;
  offerId: string | null;
  initiatorId: string | null;
  recipientId: string | null;
  offer: { id?: string; buyerId: string; sellerId: string } | null;
};

export function participantIds(
  conv: ConversationParticipants,
): [string, string] | null {
  if (conv.offer) return [conv.offer.buyerId, conv.offer.sellerId];
  if (conv.initiatorId && conv.recipientId) {
    return [conv.initiatorId, conv.recipientId];
  }
  return null;
}

export function isParticipant(
  conv: ConversationParticipants,
  userId: string,
): boolean {
  const pair = participantIds(conv);
  return pair != null && (pair[0] === userId || pair[1] === userId);
}

export function otherParticipantId(
  conv: ConversationParticipants,
  userId: string,
): string | null {
  const pair = participantIds(conv);
  if (!pair) return null;
  if (pair[0] === userId) return pair[1];
  if (pair[1] === userId) return pair[0];
  return null;
}

export async function loadConversation(conversationId: string) {
  if (!isConversationId(conversationId)) return { error: "invalid_id" as const };
  const conv = await db.query.conversationsTable.findFirst({
    where: eq(conversationsTable.id, conversationId),
    with: { offer: { columns: { id: true, buyerId: true, sellerId: true } } },
  });
  if (!conv) return { error: "not_found" as const };
  return { conv };
}

/**
 * Existing thread between two users, if any.
 * Prefers a direct (profile) DM via the unique pair index, then the newest
 * offer/trade conversation. Avoids scanning the messages table.
 */
export async function findConversationBetween(
  userA: string,
  userB: string,
): Promise<string | null> {
  const [dm] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        isNull(conversationsTable.offerId),
        or(
          and(
            eq(conversationsTable.initiatorId, userA),
            eq(conversationsTable.recipientId, userB),
          ),
          and(
            eq(conversationsTable.initiatorId, userB),
            eq(conversationsTable.recipientId, userA),
          ),
        ),
      ),
    )
    .limit(1);
  if (dm) return dm.id;

  const [offerConv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .innerJoin(offersTable, eq(conversationsTable.offerId, offersTable.id))
    .where(
      or(
        and(eq(offersTable.buyerId, userA), eq(offersTable.sellerId, userB)),
        and(eq(offersTable.buyerId, userB), eq(offersTable.sellerId, userA)),
      ),
    )
    .orderBy(desc(conversationsTable.createdAt))
    .limit(1);

  return offerConv?.id ?? null;
}

export async function userExists(userId: string): Promise<boolean> {
  const row = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true },
  });
  return row != null;
}

/** Reuse an existing thread or open a direct conversation (no offer). */
export async function ensureDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<{ conversationId: string; created: boolean }> {
  const existing = await findConversationBetween(userId, otherUserId);
  if (existing) return { conversationId: existing, created: false };

  try {
    const [created] = await db
      .insert(conversationsTable)
      .values({ initiatorId: userId, recipientId: otherUserId })
      .returning({ id: conversationsTable.id });
    return { conversationId: created!.id, created: true };
  } catch {
    const raced = await findConversationBetween(userId, otherUserId);
    if (raced) return { conversationId: raced, created: false };
    throw new Error("failed to create direct conversation");
  }
}
