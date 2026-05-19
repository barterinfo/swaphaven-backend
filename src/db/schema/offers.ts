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

// ─── Types ────────────────────────────────────────────────────────────────────
export type Offer            = typeof offersTable.$inferSelect;
export type OfferItem        = typeof offerItemsTable.$inferSelect;
export type CounterOffer     = typeof counterOffersTable.$inferSelect;
export type CounterOfferItem = typeof counterOfferItemsTable.$inferSelect;
