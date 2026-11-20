ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "is_giveaway" boolean DEFAULT false NOT NULL;
