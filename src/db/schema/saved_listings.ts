import {
  pgTable, uuid, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { listingsTable } from "./listings.js";

// ─── saved_listings ───────────────────────────────────────────────────────────
/** Private save-for-later rows — independent of swipe pass/like. */
export const savedListingsTable = pgTable(
  "saved_listings",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    userId:    uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("saved_listings_user_listing_uniq").on(t.userId, t.listingId),
    index("saved_listings_user_id_created_at_idx").on(t.userId, t.createdAt),
  ],
);

export type SavedListing = typeof savedListingsTable.$inferSelect;
