ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "interest_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listing_views" (
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "last_viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_user_listing_uniq" UNIQUE("user_id","listing_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_views_user_id_last_viewed_at_idx" ON "listing_views" USING btree ("user_id","last_viewed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_views_listing_id_idx" ON "listing_views" USING btree ("listing_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "listing_embeddings" (
  "listing_id" uuid PRIMARY KEY NOT NULL,
  "embedding" real[] NOT NULL,
  "model" text NOT NULL,
  "content_hash" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "listing_embeddings" ADD CONSTRAINT "listing_embeddings_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
