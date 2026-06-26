CREATE TYPE "public"."dietary_tag" AS ENUM('vegan', 'vegetarian', 'gluten_friendly', 'dairy_free', 'halal', 'nut_free', 'spicy');--> statement-breakpoint
CREATE TABLE "menu_item_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"item_id" text NOT NULL,
	"tag" "dietary_tag" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_item_tags" ADD CONSTRAINT "menu_item_tags_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_tags" ADD CONSTRAINT "menu_item_tags_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_tags_item_tag_idx" ON "menu_item_tags" USING btree ("item_id","tag");--> statement-breakpoint
CREATE INDEX "menu_item_tags_venue_idx" ON "menu_item_tags" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "menu_item_tags_item_idx" ON "menu_item_tags" USING btree ("item_id");