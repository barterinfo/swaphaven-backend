import {
  pgTable, uuid, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { listingsTable } from "./listings.js";

/** Per-user last-seen timestamp for listing detail — feeds recommendation taste. */
export const listingViewsTable = pgTable(
  "listing_views",
  {
    userId:       uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    listingId:    uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
    lastViewedAt: timestamp("last_viewed_at").notNull().defaultNow(),
  },
  (t) => [
    unique("listing_views_user_listing_uniq").on(t.userId, t.listingId),
    index("listing_views_user_id_last_viewed_at_idx").on(t.userId, t.lastViewedAt),
    index("listing_views_listing_id_idx").on(t.listingId),
  ],
);

export type ListingView = typeof listingViewsTable.$inferSelect;
