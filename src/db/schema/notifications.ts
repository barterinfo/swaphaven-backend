import {
  pgTable, uuid, text, boolean, integer, timestamp, pgEnum, index,
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
  "followed_listing",
  "new_follower",
  "followed_listing_price",
  "followed_listing_relisted",
  "followed_trade_accepted",
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
  relatedListingId:      uuid("related_listing_id"),
  /** Seller or follower who caused the alert. Used to collapse bursts. */
  actorUserId:           uuid("actor_user_id"),
  /** How many events this row represents after burst collapse. */
  burstCount:            integer("burst_count").notNull().default(1),
  isRead:                boolean("is_read").notNull().default(false),
  createdAt:             timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  // notification bell badge + list: WHERE user_id = ? ORDER BY created_at DESC
  index("notifications_user_id_created_at_idx").on(t.userId, t.createdAt),
  // unread badge count: WHERE user_id = ? AND is_read = false
  index("notifications_user_id_is_read_idx").on(t.userId, t.isRead),
  // follow burst collapse: user + type + actor + recency
  index("notifications_user_type_actor_created_at_idx").on(
    t.userId,
    t.type,
    t.actorUserId,
    t.createdAt,
  ),
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type Notification = typeof notificationsTable.$inferSelect;
