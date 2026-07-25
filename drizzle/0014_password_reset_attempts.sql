ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_attempts" integer DEFAULT 0 NOT NULL;
