import {
  pgTable, uuid, text, timestamp, pgEnum, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { offersTable } from "./offers.js";

export const messageTypeEnum = pgEnum("message_type", ["text", "image", "system"]);

// ─── conversations ────────────────────────────────────────────────────────────
export const conversationsTable = pgTable("conversations", {
  id:        uuid("id").primaryKey().defaultRandom(),
  offerId:   uuid("offer_id").notNull().unique().references(() => offersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── messages ─────────────────────────────────────────────────────────────────
export const messagesTable = pgTable("messages", {
  id:             uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId:       uuid("sender_id").notNull().references(() => usersTable.id),
  body:           text("body").notNull(),
  type:           messageTypeEnum("type").notNull().default("text"),
  readAt:         timestamp("read_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // chat pagination: WHERE conversation_id = ? ORDER BY created_at DESC
  index("messages_conversation_id_created_at_idx").on(t.conversationId, t.createdAt),
  // unread count: WHERE conversation_id IN (...) AND sender_id != ? AND read_at IS NULL
  index("messages_conversation_id_sender_id_read_at_idx").on(t.conversationId, t.senderId, t.readAt),
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message      = typeof messagesTable.$inferSelect;
