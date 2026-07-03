CREATE TABLE "nudges" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nudges_venue_key_idx" ON "nudges" USING btree ("venue_id","dedupe_key");