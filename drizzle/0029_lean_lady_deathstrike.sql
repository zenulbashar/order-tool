CREATE TYPE "public"."marketplace_category" AS ENUM('signage', 'tablet', 'stand', 'consumable', 'banner', 'other');--> statement-breakpoint
CREATE TYPE "public"."marketplace_order_status" AS ENUM('requested', 'confirmed', 'shipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "marketplace_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"name_snapshot" text NOT NULL,
	"unit_price_cents_snapshot" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_order_items_qty_pos" CHECK ("marketplace_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"status" "marketplace_order_status" DEFAULT 'requested' NOT NULL,
	"total_cents" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_orders_total_nonneg" CHECK ("marketplace_orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "marketplace_category" DEFAULT 'other' NOT NULL,
	"price_cents" integer NOT NULL,
	"unit_label" text,
	"supplier" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_products_price_nonneg" CHECK ("marketplace_products"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_order_id_marketplace_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."marketplace_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "marketplace_order_items_order_idx" ON "marketplace_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_venue_idx" ON "marketplace_orders" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_status_idx" ON "marketplace_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_products_active_idx" ON "marketplace_products" USING btree ("is_active");