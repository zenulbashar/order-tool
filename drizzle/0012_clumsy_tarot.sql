CREATE TABLE "venue_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_tables" ADD CONSTRAINT "venue_tables_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_tables_venue_idx" ON "venue_tables" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_tables_venue_label_idx" ON "venue_tables" USING btree ("venue_id",lower("label"));