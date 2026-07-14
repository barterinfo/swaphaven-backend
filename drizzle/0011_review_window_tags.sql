ALTER TABLE "trades" ADD COLUMN "review_window_closes_at" timestamp;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'reviews_revealed';--> statement-breakpoint
-- Backfill review window for trades already marked completed (7 days from completion)
UPDATE "trades" SET "review_window_closes_at" = "completed_at" + INTERVAL '7 days'
WHERE "status" = 'completed' AND "completed_at" IS NOT NULL;
