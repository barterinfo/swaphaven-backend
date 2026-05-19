import {
  pgTable, uuid, text, timestamp, pgEnum,
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
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message      = typeof messagesTable.$inferSelect;
