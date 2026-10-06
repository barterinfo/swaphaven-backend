import {
  pgTable, uuid, text, boolean, timestamp, pgEnum, jsonb, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const emailOutboxStatusEnum = pgEnum("email_outbox_status", [
  "pending",
  "sent",
  "cancelled",
]);

/** Hot presence writes stay off the users row. */
export const userPresenceTable = pgTable("user_presence", {
  userId:         uuid("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  lastSeenAt:     timestamp("last_seen_at").notNull().defaultNow(),
  isForeground:   boolean("is_foreground").notNull().default(false),
  /** null = never reported (legacy clients); fall back to device_tokens. */
  pushEnabled:    boolean("push_enabled"),
  pushReportedAt: timestamp("push_reported_at"),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

export type ActivityEmailPayload = Record<string, unknown>;

export const emailOutboxTable = pgTable("email_outbox", {
  id:          uuid("id").primaryKey().defaultRandom(),
  userId:      uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventType:   text("event_type").notNull(),
  /** Chat coalesce key e.g. `new_message:<conversationId>`. */
  coalesceKey: text("coalesce_key"),
  payload:     jsonb("payload").$type<ActivityEmailPayload>().notNull().default({}),
  summary:     text("summary").notNull(),
  status:      emailOutboxStatusEnum("status").notNull().default("pending"),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  sentAt:      timestamp("sent_at"),
}, (t) => [
  index("email_outbox_status_created_at_idx").on(t.status, t.createdAt),
  index("email_outbox_user_id_status_idx").on(t.userId, t.status),
  index("email_outbox_user_coalesce_pending_idx").on(t.userId, t.coalesceKey, t.status),
]);

export type UserPresence = typeof userPresenceTable.$inferSelect;
export type EmailOutbox = typeof emailOutboxTable.$inferSelect;
