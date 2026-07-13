ALTER TYPE "public"."marketplace_order_status" ADD VALUE 'pending_payment';--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD COLUMN "paid_at" timestamp with time zone;