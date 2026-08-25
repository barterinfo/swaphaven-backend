ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "location_country" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Backfill listing countries from known Singapore fallback coordinates used by mobile.
UPDATE "listings"
SET "location_country" = 'SG'
WHERE ("location_country" IS NULL OR "location_country" = '')
  AND "location_lat" IS NOT NULL
  AND "location_lng" IS NOT NULL
  AND abs(("location_lat")::float - 1.3521) < 0.0001
  AND abs(("location_lng")::float - 103.8198) < 0.0001;
