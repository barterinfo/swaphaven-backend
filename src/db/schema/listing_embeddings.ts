import {
  pgTable, uuid, text, timestamp, real,
} from "drizzle-orm/pg-core";
import { listingsTable } from "./listings.js";

/** Content embedding for a listing. Written by barter-ai; read for ranking. */
export const listingEmbeddingsTable = pgTable("listing_embeddings", {
  listingId:    uuid("listing_id").primaryKey().references(() => listingsTable.id, { onDelete: "cascade" }),
  embedding:    real("embedding").array().notNull(),
  model:        text("model").notNull(),
  contentHash:  text("content_hash").notNull(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export type ListingEmbedding = typeof listingEmbeddingsTable.$inferSelect;
