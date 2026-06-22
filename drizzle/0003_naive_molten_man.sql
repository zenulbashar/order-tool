CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('pickup', 'dine_in');--> statement-breakpoint
CREATE TABLE "order_item_modifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"modifier_option_id" text,
	"name_snapshot" text NOT NULL,
	"price_delta_cents_snapshot" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_item_modifiers_price_delta_nonneg" CHECK ("order_item_modifiers"."price_delta_cents_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"menu_item_id" text,
	"item_name_snapshot" text NOT NULL,
	"unit_price_cents_snapshot" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_pos" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_nonneg" CHECK ("order_items"."unit_price_cents_snapshot" >= 0),
	CONSTRAINT "order_items_line_total_nonneg" CHECK ("order_items"."line_total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"public_token" text NOT NULL,
	"order_type" "order_type" NOT NULL,
	"table_label" text,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_subtotal_cents_nonneg" CHECK ("orders"."subtotal_cents" >= 0),
	CONSTRAINT "orders_total_cents_nonneg" CHECK ("orders"."total_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_item_modifiers_order_item_idx" ON "order_item_modifiers" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_item_modifiers_venue_idx" ON "order_item_modifiers" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_venue_idx" ON "order_items" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_token_idx" ON "orders" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "orders_venue_idx" ON "orders" USING btree ("venue_id");