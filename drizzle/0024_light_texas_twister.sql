CREATE TYPE "public"."stock_movement_reason" AS ENUM('opening', 'receiving', 'adjustment', 'wastage', 'stocktake', 'depletion');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"delta_qty" double precision NOT NULL,
	"reason" "stock_movement_reason" NOT NULL,
	"order_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "on_hand_qty" double precision;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "par_level" double precision;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_venue_idx" ON "stock_movements" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_idx" ON "stock_movements" USING btree ("ingredient_id");--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_par_level_nonneg" CHECK ("ingredients"."par_level" IS NULL OR "ingredients"."par_level" >= 0);