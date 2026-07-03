CREATE TABLE "invoice_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"supplier" text,
	"line_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_scans" ADD CONSTRAINT "invoice_scans_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_scans_venue_idx" ON "invoice_scans" USING btree ("venue_id");