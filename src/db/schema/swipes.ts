import {
  pgTable, uuid, timestamp, pgEnum, unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { listingsTable } from "./listings.js";

export const swipeDirectionEnum = pgEnum("swipe_direction", ["left", "right"]);

// ─── swipes ───────────────────────────────────────────────────────────────────
export const swipesTable = pgTable(
  "swipes",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    swiperId:  uuid("swiper_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
    direction: swipeDirectionEnum("direction").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("swipes_swiper_listing_uniq").on(t.swiperId, t.listingId)],
);

export type Swipe = typeof swipesTable.$inferSelect;
