import {
  pgTable, uuid, text, integer, timestamp, pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { offersTable, counterOffersTable } from "./offers.js";

export const tradeStatusEnum = pgEnum("trade_status", [
  "pending_meetup", "completed", "disputed", "cancelled",
]);

// ─── trades ───────────────────────────────────────────────────────────────────
export const tradesTable = pgTable("trades", {
  id:             uuid("id").primaryKey().defaultRandom(),
  offerId:        uuid("offer_id").notNull().unique().references(() => offersTable.id),
  counterOfferId: uuid("counter_offer_id").references(() => counterOffersTable.id),
  status:         tradeStatusEnum("status").notNull().default("pending_meetup"),
  completedAt:    timestamp("completed_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// ─── trade_reviews ────────────────────────────────────────────────────────────
export const tradeReviewsTable = pgTable("trade_reviews", {
  id:         uuid("id").primaryKey().defaultRandom(),
  tradeId:    uuid("trade_id").notNull().references(() => tradesTable.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => usersTable.id),
  revieweeId: uuid("reviewee_id").notNull().references(() => usersTable.id),
  rating:     integer("rating").notNull(),
  comment:    text("comment"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Trade       = typeof tradesTable.$inferSelect;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
