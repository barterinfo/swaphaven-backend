import {
  pgTable, uuid, boolean, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

// ─── user_follows ─────────────────────────────────────────────────────────────
/** One-way follow: follower watches followee's new listings. */
export const userFollowsTable = pgTable(
  "user_follows",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    followerId: uuid("follower_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    followeeId: uuid("followee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    /** When true, keep the follow and ranking boost but skip activity pushes. */
    alertsMuted: boolean("alerts_muted").notNull().default(false),
    createdAt:  timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("user_follows_follower_followee_uniq").on(t.followerId, t.followeeId),
    index("user_follows_follower_id_created_at_idx").on(t.followerId, t.createdAt),
    index("user_follows_followee_id_created_at_idx").on(t.followeeId, t.createdAt),
  ],
);

export type UserFollow = typeof userFollowsTable.$inferSelect;
