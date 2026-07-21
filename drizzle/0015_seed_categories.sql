-- Canonical browse categories (slugs align with mobile browse/create catalogs).
-- Fixed UUIDs so seeds/tests can reference them stably.
INSERT INTO "categories" ("id", "name", "slug", "icon", "parent_id") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Clothing', 'clothing', '👕', NULL),
  ('a0000000-0000-4000-8000-000000000002', 'Electronics', 'electronics', '📱', NULL),
  ('a0000000-0000-4000-8000-000000000003', 'Home & Kitchen', 'home_kitchen', '🏠', NULL),
  ('a0000000-0000-4000-8000-000000000004', 'Furniture', 'furniture', '🛋️', NULL),
  ('a0000000-0000-4000-8000-000000000005', 'Books', 'books', '📚', NULL),
  ('a0000000-0000-4000-8000-000000000006', 'Sneakers', 'sneakers', '👟', NULL),
  ('a0000000-0000-4000-8000-000000000007', 'Cameras', 'cameras', '📷', NULL),
  ('a0000000-0000-4000-8000-000000000008', 'Sports & Fitness', 'sports_fitness', '🏋️', NULL),
  ('a0000000-0000-4000-8000-000000000009', 'Toys & Games', 'toys_games', '🎮', NULL),
  ('a0000000-0000-4000-8000-00000000000a', 'Tools', 'tools', '🔧', NULL),
  ('a0000000-0000-4000-8000-00000000000b', 'Garden & Outdoor', 'garden_outdoor', '🌱', NULL),
  ('a0000000-0000-4000-8000-00000000000c', 'Art & Collectibles', 'art_collectibles', '🎨', NULL),
  ('a0000000-0000-4000-8000-00000000000d', 'Instruments', 'instruments', '🎸', NULL),
  ('a0000000-0000-4000-8000-00000000000e', 'Baby & Kids', 'baby_kids', '🍼', NULL),
  ('a0000000-0000-4000-8000-00000000000f', 'Vehicles & Parts', 'vehicles_parts', '🚗', NULL),
  ('a0000000-0000-4000-8000-000000000010', 'Other Toys', 'other_toys', '🧩', NULL),
  ('a0000000-0000-4000-8000-000000000011', 'Board Games', 'board_games', '♟️', NULL)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- Backfill FK for legacy rows that only stored text category / slug.
UPDATE "listings" AS l
SET "category_id" = c."id"
FROM "categories" AS c
WHERE l."category_id" IS NULL
  AND (
    lower(l."category") = lower(c."slug")
    OR lower(l."category") = lower(c."name")
  );--> statement-breakpoint
