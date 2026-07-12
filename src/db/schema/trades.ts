import {
  pgTable, uuid, text, integer, timestamp, pgEnum, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { offersTable, counterOffersTable, offerRoundsTable } from "./offers.js";

export const tradeStatusEnum = pgEnum("trade_status", [
  "pending_meetup", "completed", "disputed", "cancelled",
]);

// ─── trades ───────────────────────────────────────────────────────────────────
export const tradesTable = pgTable("trades", {
  id:                uuid("id").primaryKey().defaultRandom(),
  offerId:           uuid("offer_id").notNull().unique().references(() => offersTable.id),
  counterOfferId:    uuid("counter_offer_id").references(() => counterOffersTable.id),
  /** Round that was accepted to create this trade (null for direct accepts). */
  acceptedRoundId:   uuid("accepted_round_id").references(() => offerRoundsTable.id),
  status:            tradeStatusEnum("status").notNull().default("pending_meetup"),
  meetupScheduledAt: timestamp("meetup_scheduled_at"),
  meetupLocation:    text("meetup_location"),
  completedAt:       timestamp("completed_at"),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
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
}, (t) => [
  // GET /api/users/:userId/reviews: WHERE reviewee_id = ? ORDER BY created_at DESC
  index("trade_reviews_reviewee_id_created_at_idx").on(t.revieweeId, t.createdAt),
]);

// ─── Types ────────────────────────────────────────────────────────────────────
export type Trade       = typeof tradesTable.$inferSelect;
export type TradeReview = typeof tradeReviewsTable.$inferSelect;
