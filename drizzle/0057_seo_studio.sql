CREATE TYPE "public"."seo_audit_kind" AS ENUM('seo', 'aeo');--> statement-breakpoint
CREATE TABLE "seo_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"kind" "seo_audit_kind" NOT NULL,
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"checks" jsonb NOT NULL,
	"issues" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"generated_copy" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_audits_score_range" CHECK ("seo_audits"."score" >= 0 AND "seo_audits"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "seo_search_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"day" date NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" double precision DEFAULT 0 NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seo_search_daily_nonneg" CHECK ("seo_search_daily"."clicks" >= 0 AND "seo_search_daily"."impressions" >= 0)
);
--> statement-breakpoint
CREATE TABLE "seo_search_summary" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"top_queries" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_audits" ADD CONSTRAINT "seo_audits_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_search_daily" ADD CONSTRAINT "seo_search_daily_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_search_summary" ADD CONSTRAINT "seo_search_summary_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seo_audits_venue_kind_created_idx" ON "seo_audits" USING btree ("venue_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_search_daily_venue_day_idx" ON "seo_search_daily" USING btree ("venue_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_search_summary_venue_idx" ON "seo_search_summary" USING btree ("venue_id");