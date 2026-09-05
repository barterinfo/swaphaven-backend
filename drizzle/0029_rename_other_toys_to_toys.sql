-- Rename display label "Other Toys" → "Toys" (slug stays other_toys).
UPDATE "categories"
SET "name" = 'Toys'
WHERE "slug" = 'other_toys' AND "name" = 'Other Toys';
