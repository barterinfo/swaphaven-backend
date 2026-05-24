ALTER TABLE "listings" ADD COLUMN "category" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "estimated_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "accept_cash_top_ups" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "wanted_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "wanted_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "details" jsonb DEFAULT '{"ageRange":"","brand":""}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "review_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "location_address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "location_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "location_country" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "location_postal_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "proposed_trade" text DEFAULT '' NOT NULL;