import {
  pgTable, pgEnum, uuid, text, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const reportTargetEnum = pgEnum("report_target", [
  "listing",
  "user",
  "conversation",
]);

export const reportReasonEnum = pgEnum("report_reason", [
  "spam",
  "scam",
  "inappropriate",
  "harassment",
  "prohibited_item",
  "other",
]);

/** Moderation queue status — reports never auto-ban; ops set this manually. */
export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "dismissed",
  "actioned",
]);

/** One-way block: blocker no longer sees the blocked user (not a platform ban). */
export const userBlocksTable = pgTable(
  "user_blocks",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("user_blocks_blocker_blocked_uniq").on(t.blockerId, t.blockedId),
    index("user_blocks_blocker_id_idx").on(t.blockerId),
    index("user_blocks_blocked_id_idx").on(t.blockedId),
  ],
);

/**
 * User-submitted reports. Stored as `pending` for human review.
 * Creating a report does not hide content or ban anyone.
 */
export const contentReportsTable = pgTable(
  "content_reports",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    reporterId:     uuid("reporter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    targetType:     reportTargetEnum("target_type").notNull(),
    targetId:       uuid("target_id").notNull(),
    reportedUserId: uuid("reported_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    reason:         reportReasonEnum("reason").notNull(),
    details:        text("details"),
    status:         reportStatusEnum("status").notNull().default("pending"),
    createdAt:      timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("content_reports_reporter_target_uniq").on(t.reporterId, t.targetType, t.targetId),
    index("content_reports_status_created_at_idx").on(t.status, t.createdAt),
    index("content_reports_reporter_id_created_at_idx").on(t.reporterId, t.createdAt),
  ],
);

export type UserBlock = typeof userBlocksTable.$inferSelect;
export type ContentReport = typeof contentReportsTable.$inferSelect;
