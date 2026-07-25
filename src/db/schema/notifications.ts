import {
  pgTable, uuid, text, boolean, timestamp, pgEnum, index,
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
  "trade_cancelled",
  "message",
  "review_received",
  "reviews_revealed",
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
}, (t) => [
  // notification bell badge + list: WHERE user_id = ? ORDER BY created_at DESC
  index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt),
  // unread badge count: WHERE user_id = ? AND is_read = false
  index("notifications_user_id_is_read_idx").on(t.userId, t.isRead),
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type Notification = typeof notificationsTable.$inferSelect;
