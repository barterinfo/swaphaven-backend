ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "review_window_closes_at" timestamp;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'reviews_revealed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
-- Backfill review window for trades already marked completed (7 days from completion)
UPDATE "trades" SET "review_window_closes_at" = "completed_at" + INTERVAL '7 days'
WHERE "status" = 'completed'
  AND "completed_at" IS NOT NULL
  AND "review_window_closes_at" IS NULL;
