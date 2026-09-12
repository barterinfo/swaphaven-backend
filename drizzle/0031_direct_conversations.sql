ALTER TABLE "conversations" ALTER COLUMN "offer_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "initiator_id" uuid;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "recipient_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_initiator_id_users_id_fk"
    FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_recipient_id_users_id_fk"
    FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_offer_or_dm_chk" CHECK (
    ("offer_id" IS NOT NULL AND "initiator_id" IS NULL AND "recipient_id" IS NULL)
    OR (
      "offer_id" IS NULL
      AND "initiator_id" IS NOT NULL
      AND "recipient_id" IS NOT NULL
      AND "initiator_id" <> "recipient_id"
    )
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_dm_pair_uidx"
  ON "conversations" (LEAST("initiator_id", "recipient_id"), GREATEST("initiator_id", "recipient_id"))
  WHERE "offer_id" IS NULL;
