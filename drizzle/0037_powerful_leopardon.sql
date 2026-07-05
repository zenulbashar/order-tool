CREATE TABLE "venue_images" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_images" ADD CONSTRAINT "venue_images_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_images_venue_idx" ON "venue_images" USING btree ("venue_id");