CREATE TYPE "public"."order_fulfillment_status" AS ENUM('new', 'preparing', 'ready', 'completed');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_status" "order_fulfillment_status" DEFAULT 'new' NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_venue_status_created_idx" ON "orders" USING btree ("venue_id","status","created_at");