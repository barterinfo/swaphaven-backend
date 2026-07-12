import {
  pgTable, uuid, text, integer, boolean, timestamp, pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";
import { listingsTable } from "./listings.js";
import { swipesTable } from "./swipes.js";

export const offerStatusEnum = pgEnum("offer_status", [
  "pending", "accepted", "denied", "countered", "expired", "withdrawn",
]);
export const counterOfferStatusEnum = pgEnum("counter_offer_status", [
  "pending", "accepted", "denied", "expired",
]);
/** Which party must act next in a negotiation. */
export const offerTurnEnum = pgEnum("offer_turn", ["buyer", "seller"]);
/** Status of a single negotiation round. */
export const offerRoundStatusEnum = pgEnum("offer_round_status", [
  "pending", "superseded", "accepted", "denied",
]);
/** Which side of the trade an item belongs to in a round. */
export const offerRoundItemSideEnum = pgEnum("offer_round_item_side", ["buyer", "seller"]);

// ─── offers ───────────────────────────────────────────────────────────────────
export const offersTable = pgTable("offers", {
  id:             uuid("id").primaryKey().defaultRandom(),
  listingId:      uuid("listing_id").notNull().references(() => listingsTable.id),
  buyerId:        uuid("buyer_id").notNull().references(() => usersTable.id),
  sellerId:       uuid("seller_id").notNull().references(() => usersTable.id),
  swipeId:        uuid("swipe_id").references(() => swipesTable.id),
  status:         offerStatusEnum("status").notNull().default("pending"),
  buyerNote:      text("buyer_note"),
  cashTopUpCents: integer("cash_top_up_cents").notNull().default(0),
  /** Party who must act next; set on every round transition. */
  currentTurn:    offerTurnEnum("current_turn").notNull().default("seller"),
  /** Total rounds submitted so far (including round 1 = original offer). */
  roundCount:     integer("round_count").notNull().default(1),
  expiresAt:      timestamp("expires_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// ─── offer_items ──────────────────────────────────────────────────────────────
export const offerItemsTable = pgTable("offer_items", {
  id:        uuid("id").primaryKey().defaultRandom(),
  offerId:   uuid("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  listingId: uuid("listing_id").notNull().references(() => listingsTable.id),
  position:  integer("position").notNull().default(0),
});

// ─── counter_offers ───────────────────────────────────────────────────────────
export const counterOffersTable = pgTable("counter_offers", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  offerId:            uuid("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  sellerId:           uuid("seller_id").notNull().references(() => usersTable.id),
  status:             counterOfferStatusEnum("status").notNull().default("pending"),
  sellerNote:         text("seller_note"),
  cashRequestedCents: integer("cash_requested_cents").notNull().default(0),
  expiresAt:          timestamp("expires_at"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
});

// ─── counter_offer_items ──────────────────────────────────────────────────────
export const counterOfferItemsTable = pgTable("counter_offer_items", {
  id:             uuid("id").primaryKey().defaultRandom(),
  counterOfferId: uuid("counter_offer_id").notNull().references(() => counterOffersTable.id, { onDelete: "cascade" }),
  offerItemId:    uuid("offer_item_id").notNull().references(() => offerItemsTable.id),
  isIncluded:     boolean("is_included").notNull().default(true),
});

// ─── offer_rounds ─────────────────────────────────────────────────────────────
// Each round is a complete snapshot of the proposed trade terms. Round 1 is
// inserted on offer creation (buyer's original proposal); subsequent rounds are
// created by POST /counter (either party). The latest "pending" round is what
// both parties see in the detail/bundle screen.
export const offerRoundsTable = pgTable("offer_rounds", {
  id:                       uuid("id").primaryKey().defaultRandom(),
  offerId:                  uuid("offer_id").notNull().references(() => offersTable.id, { onDelete: "cascade" }),
  roundNumber:              integer("round_number").notNull(),
  proposedBy:               offerTurnEnum("proposed_by").notNull(),
  buyerCashTopUpCents:      integer("buyer_cash_top_up_cents").notNull().default(0),
  sellerCashRequestedCents: integer("seller_cash_requested_cents").notNull().default(0),
  note:                     text("note"),
  status:                   offerRoundStatusEnum("status").notNull().default("pending"),
  createdAt:                timestamp("created_at").notNull().defaultNow(),
  updatedAt:                timestamp("updated_at").notNull().defaultNow(),
});

// ─── offer_round_items ────────────────────────────────────────────────────────
export const offerRoundItemsTable = pgTable("offer_round_items", {
  id:            uuid("id").primaryKey().defaultRandom(),
  offerRoundId:  uuid("offer_round_id").notNull().references(() => offerRoundsTable.id, { onDelete: "cascade" }),
  listingId:     uuid("listing_id").notNull().references(() => listingsTable.id),
  /** Which side of the trade this listing belongs to. */
  side:          offerRoundItemSideEnum("side").notNull(),
  position:      integer("position").notNull().default(0),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Offer            = typeof offersTable.$inferSelect;
export type OfferItem        = typeof offerItemsTable.$inferSelect;
export type CounterOffer     = typeof counterOffersTable.$inferSelect;
export type CounterOfferItem = typeof counterOfferItemsTable.$inferSelect;
export type OfferRound       = typeof offerRoundsTable.$inferSelect;
export type OfferRoundItem   = typeof offerRoundItemsTable.$inferSelect;
