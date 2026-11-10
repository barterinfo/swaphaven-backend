import {
  pgTable, uuid, text, timestamp, real, pgEnum, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { listingsTable } from "./listings.js";

export const askEventKindEnum = pgEnum("ask_event_kind", [
  "selected",
  "dismissed",
  "offered",
]);

export const userWantStatusEnum = pgEnum("user_want_status", [
  "active",
  "paused",
  "fulfilled",
]);

/** Ask card interactions — folded into barter-ai taste like swipes/saves. */
export const askEventsTable = pgTable(
  "ask_events",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    userId:    uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
    kind:      askEventKindEnum("kind").notNull(),
    threadId:  uuid("thread_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ask_events_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("ask_events_listing_id_idx").on(t.listingId),
  ],
);

/**
 * Explicit “I am looking for X” — matched when a new listing is published.
 * One active row per (user, normalized query) is enforced in SQL
 * (`user_wants_user_query_active_uniq` partial unique index).
 */
export const userWantsTable = pgTable(
  "user_wants",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    userId:         uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    queryText:      text("query_text").notNull(),
    /** Lowercased trimmed query for uniqueness among active wants. */
    queryNormalized: text("query_normalized").notNull(),
    embedding:      real("embedding").array(),
    categorySlug:   text("category_slug"),
    status:         userWantStatusEnum("status").notNull().default("active"),
    lastNotifiedAt: timestamp("last_notified_at"),
    createdAt:      timestamp("created_at").notNull().defaultNow(),
    updatedAt:      timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("user_wants_status_created_at_idx").on(t.status, t.createdAt),
    index("user_wants_user_id_status_idx").on(t.userId, t.status),
  ],
);

export type AskEvent = typeof askEventsTable.$inferSelect;
export type UserWant = typeof userWantsTable.$inferSelect;
