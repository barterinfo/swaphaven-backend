import {
  pgTable, uuid, text, boolean, integer,
  timestamp, pgEnum, decimal, jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const conditionEnum     = pgEnum("condition", ["new", "like_new", "great", "good", "fair"]);
export const listingStatusEnum = pgEnum("listing_status", ["active", "traded", "paused", "deleted"]);

export type ListingDetails = { ageRange: string; brand: string };

// ─── categories ───────────────────────────────────────────────────────────────
export const categoriesTable = pgTable("categories", {
  id:       uuid("id").primaryKey().defaultRandom(),
  name:     text("name").notNull().unique(),
  slug:     text("slug").notNull().unique(),
  icon:     text("icon"),
  parentId: uuid("parent_id"),
});

// ─── listings (aligned with barter-stack Mongo Listing + mobile create payload)
export const listingsTable = pgTable("listings", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  userId:              uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  categoryId:          uuid("category_id").references(() => categoriesTable.id),
  title:               text("title").notNull(),
  description:         text("description").notNull().default(""),
  category:            text("category").notNull().default("general"),
  condition:           conditionEnum("condition").notNull(),
  estimatedValue:      integer("estimated_value").notNull().default(0),
  estimatedValueCents: integer("estimated_value_cents"),
  acceptCashTopUps:    boolean("accept_cash_top_ups").notNull().default(false),
  wantedCategoryIds:   jsonb("wanted_category_ids").$type<string[]>().notNull().default([]),
  wantedCategories:    jsonb("wanted_categories").$type<string[]>().notNull().default([]),
  details:             jsonb("details").$type<ListingDetails>().notNull().default({ ageRange: "", brand: "" }),
  reviewSnapshot:      jsonb("review_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  isSwipeOnly:         boolean("is_swipe_only").notNull().default(false),
  status:              listingStatusEnum("status").notNull().default("active"),
  locationCity:        text("location_city").notNull().default(""),
  locationLat:         decimal("location_lat", { precision: 9, scale: 6 }),
  locationLng:         decimal("location_lng", { precision: 9, scale: 6 }),
  locationAddress:     text("location_address").notNull().default(""),
  locationState:       text("location_state").notNull().default(""),
  locationCountry:     text("location_country").notNull().default(""),
  locationPostalCode:  text("location_postal_code").notNull().default(""),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

// ─── listing_images ───────────────────────────────────────────────────────────
export const listingImagesTable = pgTable("listing_images", {
  id:        uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  url:       text("url").notNull(),
  position:  integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── listing_wants ────────────────────────────────────────────────────────────
export const listingWantsTable = pgTable("listing_wants", {
  id:         uuid("id").primaryKey().defaultRandom(),
  listingId:  uuid("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").references(() => categoriesTable.id),
  freeText:   text("free_text"),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type Category     = typeof categoriesTable.$inferSelect;
export type Listing      = typeof listingsTable.$inferSelect;
export type ListingImage = typeof listingImagesTable.$inferSelect;
export type ListingWant  = typeof listingWantsTable.$inferSelect;
