CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed', 'canceled');--> statement-breakpoint
ALTER TYPE "public"."gift_card_reason" ADD VALUE 'refund_reversal';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'partially_refunded';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'refunded';--> statement-breakpoint
ALTER TYPE "public"."points_ledger_reason" ADD VALUE 'refund_reversal';--> statement-breakpoint
ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'refund_restock';--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"note" text,
	"actor_user_id" text,
	"stripe_refund_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refunds_order_idx" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refunds_venue_created_idx" ON "refunds" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_stripe_refund_id_uniq" ON "refunds" USING btree ("stripe_refund_id") WHERE "refunds"."stripe_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_order_ingredient_reason_uniq" ON "stock_movements" USING btree ("order_id","ingredient_id","reason") WHERE "stock_movements"."order_id" IS NOT NULL;