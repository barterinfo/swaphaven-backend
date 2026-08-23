-- Cents is the only estimated-value unit. Backfill, then drop whole-dollar column.
UPDATE "listings"
SET "estimated_value_cents" = "estimated_value" * 100
WHERE ("estimated_value_cents" IS NULL OR "estimated_value_cents" = 0)
  AND "estimated_value" > 0;--> statement-breakpoint
UPDATE "listings"
SET "estimated_value_cents" = 0
WHERE "estimated_value_cents" IS NULL;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "estimated_value_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "estimated_value_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" DROP COLUMN IF EXISTS "estimated_value";
