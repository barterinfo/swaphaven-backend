ALTER TABLE "user_profiles" ADD COLUMN "is_phone_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "completion_rate" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "avg_response_minutes" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;