import {
  pgTable, uuid, text, boolean, integer,
  timestamp, pgEnum, decimal,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users.js";

export const conditionEnum     = pgEnum("condition", ["new", "like_new", "great", "good", "fair"]);
export const listingStatusEnum = pgEnum("listing_status", ["active", "traded", "paused", "deleted"]);

// ─── categories ───────────────────────────────────────────────────────────────
export const categoriesTable = pgTable("categories", {
  id:       uuid("id").primaryKey().defaultRandom(),
  name:     text("name").notNull().unique(),
  slug:     text("slug").notNull().unique(),
  icon:     text("icon"),
  parentId: uuid("parent_id"),
});

// ─── listings ─────────────────────────────────────────────────────────────────
export const listingsTable = pgTable("listings", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  userId:              uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  categoryId:          uuid("category_id").references(() => categoriesTable.id),
  title:               text("title").notNull(),
  description:         text("description"),
  condition:           conditionEnum("condition").notNull(),
  estimatedValueCents: integer("estimated_value_cents"),
  isSwipeOnly:         boolean("is_swipe_only").notNull().default(false),
  status:              listingStatusEnum("status").notNull().default("active"),
  locationCity:        text("location_city"),
  locationLat:         decimal("location_lat", { precision: 9, scale: 6 }),
  locationLng:         decimal("location_lng", { precision: 9, scale: 6 }),
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
