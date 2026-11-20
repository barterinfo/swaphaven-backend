-- Ask chat: choice events, saved wants, want_match notifications.

ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'want_match';--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."ask_event_kind" AS ENUM('selected', 'dismissed', 'offered');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."user_want_status" AS ENUM('active', 'paused', 'fulfilled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ask_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "listing_id" uuid NOT NULL,
  "kind" "ask_event_kind" NOT NULL,
  "thread_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_wants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "query_text" text NOT NULL,
  "query_normalized" text NOT NULL,
  "embedding" real[],
  "category_slug" text,
  "status" "user_want_status" DEFAULT 'active' NOT NULL,
  "last_notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ask_events" ADD CONSTRAINT "ask_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "ask_events" ADD CONSTRAINT "ask_events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_wants" ADD CONSTRAINT "user_wants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ask_events_user_id_created_at_idx" ON "ask_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ask_events_listing_id_idx" ON "ask_events" USING btree ("listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_wants_user_query_active_uniq" ON "user_wants" USING btree ("user_id","query_normalized") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_wants_status_created_at_idx" ON "user_wants" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_wants_user_id_status_idx" ON "user_wants" USING btree ("user_id","status");
