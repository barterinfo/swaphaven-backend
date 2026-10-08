CREATE TYPE "public"."email_outbox_status" AS ENUM('pending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"is_foreground" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean,
	"push_reported_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"coalesce_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"status" "email_outbox_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_status_created_at_idx" ON "email_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_user_id_status_idx" ON "email_outbox" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_outbox_user_coalesce_pending_idx" ON "email_outbox" USING btree ("user_id","coalesce_key","status");
