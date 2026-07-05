import {
  pgTable, uuid, text, boolean, timestamp, integer, index,
} from "drizzle-orm/pg-core";

// ─── sponsored_ads ────────────────────────────────────────────────────────────
// Curated house / sponsor cards interleaved into the swipe deck.
// Add / pause rows here to change ads without an app release.
export const sponsoredAdsTable = pgTable("sponsored_ads", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  sponsorName:         text("sponsor_name").notNull(),
  tagline:             text("tagline").notNull(),
  ctaLabel:            text("cta_label").notNull(),
  // Hex color for the CTA button background, e.g. "#F59E0B".
  ctaColor:            text("cta_color").notNull(),
  // Destination opened when the CTA is tapped (http(s) or app deep link).
  // NULL / empty renders the CTA as a no-op badge.
  ctaUrl:              text("cta_url"),
  backgroundImageUrl:  text("background_image_url").notNull().default(""),
  active:              boolean("active").notNull().default(true),
  // Reserved for weighted random rotation. Higher = shown more often.
  weight:              integer("weight").notNull().default(1),
  // Denormalized total CTA clicks (POST /api/ads/:id/click).
  clickCount:          integer("click_count").notNull().default(0),
  // Optional campaign window; NULL = unbounded on that side.
  startsAt:            timestamp("starts_at", { withTimezone: true }),
  endsAt:              timestamp("ends_at",   { withTimezone: true }),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Hot path: GET /api/ads/active filters WHERE active = true. Small table,
  // one index is enough — no need to index the date window separately.
  index("sponsored_ads_active_idx").on(t.active),
]);

export type SponsoredAd = typeof sponsoredAdsTable.$inferSelect;
export type NewSponsoredAd = typeof sponsoredAdsTable.$inferInsert;
