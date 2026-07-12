CREATE TYPE "public"."offer_round_item_side" AS ENUM('buyer', 'seller');--> statement-breakpoint
CREATE TYPE "public"."offer_round_status" AS ENUM('pending', 'superseded', 'accepted', 'denied');--> statement-breakpoint
CREATE TYPE "public"."offer_turn" AS ENUM('buyer', 'seller');--> statement-breakpoint
CREATE TABLE "offer_round_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_round_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"side" "offer_round_item_side" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"proposed_by" "offer_turn" NOT NULL,
	"buyer_cash_top_up_cents" integer DEFAULT 0 NOT NULL,
	"seller_cash_requested_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"status" "offer_round_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "current_turn" "offer_turn" DEFAULT 'seller' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "round_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "accepted_round_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_round_items" ADD CONSTRAINT "offer_round_items_offer_round_id_offer_rounds_id_fk" FOREIGN KEY ("offer_round_id") REFERENCES "public"."offer_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_round_items" ADD CONSTRAINT "offer_round_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_rounds" ADD CONSTRAINT "offer_rounds_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_accepted_round_id_offer_rounds_id_fk" FOREIGN KEY ("accepted_round_id") REFERENCES "public"."offer_rounds"("id") ON DELETE no action ON UPDATE no action;