CREATE TYPE "public"."points_ledger_reason" AS ENUM('earn', 'redeem', 'adjust');--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"order_id" text,
	"delta_points" integer NOT NULL,
	"reason" "points_ledger_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "loyalty_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "loyalty_earn_rate_per_dollar" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "loyalty_redeem_value_cents" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "loyalty_min_redeem_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "points_ledger_venue_customer_idx" ON "points_ledger" USING btree ("venue_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "points_ledger_order_reason_idx" ON "points_ledger" USING btree ("order_id","reason");