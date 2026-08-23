-- Catch-all category for items that don't fit the rest of the catalog.
INSERT INTO "categories" ("id", "name", "slug", "icon", "parent_id") VALUES
  ('a0000000-0000-4000-8000-000000000013', 'Others', 'others', '📦', NULL)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
