DO $$ BEGIN
  ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'trade_cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
