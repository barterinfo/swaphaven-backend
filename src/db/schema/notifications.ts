import {
  pgTable, uuid, text, boolean, timestamp, pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const notificationTypeEnum = pgEnum("notification_type", [
  "offer_received",
  "offer_accepted",
  "offer_denied",
  "offer_withdrawn",
  "counter_received",
  "counter_accepted",
  "counter_denied",
  "trade_confirmed",
  "trade_completed",
  "message",
  "review_received",
  "swipe_match",
  "streak_milestone",
]);

// ─── notifications ────────────────────────────────────────────────────────────
export const notificationsTable = pgTable("notifications", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  userId:                uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type:                  notificationTypeEnum("type").notNull(),
  title:                 text("title").notNull(),
  body:                  text("body").notNull(),
  relatedOfferId:        uuid("related_offer_id"),
  relatedTradeId:        uuid("related_trade_id"),
  relatedConversationId: uuid("related_conversation_id"),
  isRead:                boolean("is_read").notNull().default(false),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Notification = typeof notificationsTable.$inferSelect;
