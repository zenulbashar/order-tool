CREATE TABLE "aeo_visibility_probes" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"run_id" text NOT NULL,
	"trigger" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"question" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"cited" boolean NOT NULL,
	"cited_by" text,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aeo_visibility_probes" ADD CONSTRAINT "aeo_visibility_probes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aeo_visibility_probes_venue_created_idx" ON "aeo_visibility_probes" USING btree ("venue_id","created_at");--> statement-breakpoint
CREATE INDEX "aeo_visibility_probes_venue_run_idx" ON "aeo_visibility_probes" USING btree ("venue_id","run_id");