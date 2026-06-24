ALTER TYPE "public"."order_status" ADD VALUE 'payment_failed';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_charges_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_onboarded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "orders_payment_intent_idx" ON "orders" USING btree ("stripe_payment_intent_id");