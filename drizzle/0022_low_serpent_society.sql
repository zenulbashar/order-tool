CREATE TABLE "recipe_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_lines_qty_pos" CHECK ("recipe_lines"."qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_lines_venue_idx" ON "recipe_lines" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_item_idx" ON "recipe_lines" USING btree ("menu_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_lines_item_ingredient_idx" ON "recipe_lines" USING btree ("menu_item_id","ingredient_id");