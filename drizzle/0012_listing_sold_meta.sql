ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "sold_method" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "traded_with_user_id" uuid;
