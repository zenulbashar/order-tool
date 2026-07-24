CREATE TABLE "venue_faqs" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_faqs" ADD CONSTRAINT "venue_faqs_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "venue_faqs_venue_idx" ON "venue_faqs" USING btree ("venue_id","sort_order");