ALTER TABLE "listings" ADD COLUMN "right_swipe_count" integer DEFAULT 0 NOT NULL;

UPDATE listings l
SET right_swipe_count = sub.cnt
FROM (
  SELECT listing_id, COUNT(*)::int AS cnt
  FROM swipes
  WHERE direction = 'right'
  GROUP BY listing_id
) sub
WHERE l.id = sub.listing_id;
