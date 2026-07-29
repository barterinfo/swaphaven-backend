-- Idempotent safety net when 0019/0020 did not fully apply (e.g. migrate skipped).

CREATE TABLE IF NOT EXISTS "saved_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_listings_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "saved_listings"
      ADD CONSTRAINT "saved_listings_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_listings_listing_id_listings_id_fk'
  ) THEN
    ALTER TABLE "saved_listings"
      ADD CONSTRAINT "saved_listings_listing_id_listings_id_fk"
      FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'saved_listings_user_listing_uniq'
  ) THEN
    ALTER TABLE "saved_listings"
      ADD CONSTRAINT "saved_listings_user_listing_uniq" UNIQUE("user_id","listing_id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_listings_user_id_created_at_idx"
  ON "saved_listings" USING btree ("user_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "swipe_direction" ADD VALUE 'super';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "superlikes_remaining" integer NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE "offers"
  ADD COLUMN IF NOT EXISTS "is_superlike" boolean NOT NULL DEFAULT false;
