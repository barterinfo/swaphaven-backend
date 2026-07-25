-- Add jewelry to the clubbed canonical category set.
INSERT INTO "categories" ("id", "name", "slug", "icon", "parent_id") VALUES
  ('a0000000-0000-4000-8000-000000000012', 'Jewelry', 'jewelry', '💍', NULL)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
