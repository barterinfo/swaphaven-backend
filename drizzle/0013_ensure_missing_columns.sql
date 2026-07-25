-- Idempotent repair: columns from 0011/0012 that may be missing when those
-- migrations were skipped (journal `when` was earlier than 0010).
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "review_window_closes_at" timestamp;--> statement-breakpoint
ALTER TABLE "trade_reviews" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "sold_method" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "traded_with_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'reviews_revealed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
UPDATE "trades" SET "review_window_closes_at" = "completed_at" + INTERVAL '7 days'
WHERE "status" = 'completed'
  AND "completed_at" IS NOT NULL
  AND "review_window_closes_at" IS NULL;
