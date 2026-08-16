-- Non-prod wipe: existing plaintext emails cannot become NOT NULL hash/ciphertext
-- without a backfill. Truncate identity (and dependents) so the ALTER can apply.
TRUNCATE TABLE "pending_registrations";
--> statement-breakpoint
TRUNCATE TABLE "users" CASCADE;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_hash" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_ciphertext" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_masked" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash");
--> statement-breakpoint
ALTER TABLE "pending_registrations" DROP CONSTRAINT "pending_registrations_pkey";
--> statement-breakpoint
ALTER TABLE "pending_registrations" DROP COLUMN "email";
--> statement-breakpoint
ALTER TABLE "pending_registrations" ADD COLUMN "email_hash" text PRIMARY KEY NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_registrations" ADD COLUMN "email_ciphertext" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_registrations" ADD COLUMN "email_masked" text NOT NULL;
