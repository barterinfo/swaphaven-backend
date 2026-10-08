-- FK-access indexes for inbox latestRound batching (list/detail).
-- round_number DESC matches ORDER BY round_number DESC on pending lookups.
CREATE INDEX IF NOT EXISTS "offer_rounds_offer_id_status_round_number_idx"
  ON "offer_rounds" ("offer_id", "status", "round_number" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offer_round_items_offer_round_id_idx"
  ON "offer_round_items" ("offer_round_id");
