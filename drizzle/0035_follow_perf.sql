-- Denormalized follow counts (avoid COUNT on every profile GET).
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "follower_count" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "following_count" integer DEFAULT 0 NOT NULL;

UPDATE "user_profiles" AS p
SET "follower_count" = (
  SELECT count(*)::integer FROM "user_follows" uf WHERE uf."followee_id" = p."id"
);

UPDATE "user_profiles" AS p
SET "following_count" = (
  SELECT count(*)::integer FROM "user_follows" uf WHERE uf."follower_id" = p."id"
);

-- Burst-collapse lookup: user + type + actor + recency.
CREATE INDEX IF NOT EXISTS "notifications_user_type_actor_created_at_idx"
  ON "notifications" ("user_id", "type", "actor_user_id", "created_at" DESC);

-- Push fan-out loads tokens by user_id.
CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx"
  ON "device_tokens" ("user_id");

-- Followed feeds: status + owner + newest.
CREATE INDEX IF NOT EXISTS "listings_status_user_id_created_at_idx"
  ON "listings" ("status", "user_id", "created_at" DESC);
