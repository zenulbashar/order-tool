CREATE TABLE "venue_stations" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"label_print_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_stations_code_len" CHECK (char_length("venue_stations"."code") between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "station_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "station_printing_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venue_stations" ADD CONSTRAINT "venue_stations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_stations_venue_idx" ON "venue_stations" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_stations_venue_code_idx" ON "venue_stations" USING btree ("venue_id","code");--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_station_id_venue_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."venue_stations"("id") ON DELETE set null ON UPDATE no action;