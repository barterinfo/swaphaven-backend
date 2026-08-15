ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
