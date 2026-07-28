-- Extend swipe_direction enum with 'super'
ALTER TYPE "swipe_direction" ADD VALUE IF NOT EXISTS 'super';
--> statement-breakpoint
-- Track how many free superlikes each user has remaining (2 free, then must pay)
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "superlikes_remaining" integer NOT NULL DEFAULT 2;
--> statement-breakpoint
-- Flag offers created from a super-swipe
ALTER TABLE "offers" ADD COLUMN IF NOT EXISTS "is_superlike" boolean NOT NULL DEFAULT false;
