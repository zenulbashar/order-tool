CREATE TYPE "public"."gift_card_reason" AS ENUM('issue', 'redeem', 'topup', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."gift_card_status" AS ENUM('active', 'void');--> statement-breakpoint
CREATE TABLE "gift_card_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"gift_card_id" text NOT NULL,
	"order_id" text,
	"delta_cents" integer NOT NULL,
	"reason" "gift_card_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"code" text NOT NULL,
	"initial_cents" integer NOT NULL,
	"balance_cents" integer NOT NULL,
	"status" "gift_card_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_balance_nonneg" CHECK ("gift_cards"."balance_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_gift_card_id_gift_cards_id_fk" FOREIGN KEY ("gift_card_id") REFERENCES "public"."gift_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_card_ledger" ADD CONSTRAINT "gift_card_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_card_ledger_card_idx" ON "gift_card_ledger" USING btree ("gift_card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_card_ledger_order_reason_idx" ON "gift_card_ledger" USING btree ("order_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_cards_venue_code_idx" ON "gift_cards" USING btree ("venue_id","code");--> statement-breakpoint
CREATE INDEX "gift_cards_venue_idx" ON "gift_cards" USING btree ("venue_id");