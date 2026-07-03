CREATE TYPE "public"."integration_job_kind" AS ENUM('order_mirror');--> statement-breakpoint
CREATE TYPE "public"."integration_job_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('square');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'needs_attention', 'revoked', 'disabled');--> statement-breakpoint
CREATE TABLE "integration_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"kind" "integration_job_kind" NOT NULL,
	"order_id" text NOT NULL,
	"status" "integration_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_jobs_attempts_nonneg" CHECK ("integration_jobs"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "venue_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"token_refreshed_at" timestamp with time zone,
	"provider_account_id" text,
	"provider_location_id" text,
	"provider_location_name" text,
	"scopes" text,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_integrations_failures_nonneg" CHECK ("venue_integrations"."consecutive_failures" >= 0)
);
--> statement-breakpoint
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_jobs" ADD CONSTRAINT "integration_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_integrations" ADD CONSTRAINT "venue_integrations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_jobs_order_provider_kind_idx" ON "integration_jobs" USING btree ("order_id","provider","kind");--> statement-breakpoint
CREATE INDEX "integration_jobs_due_idx" ON "integration_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "integration_jobs_venue_idx" ON "integration_jobs" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_integrations_venue_provider_idx" ON "venue_integrations" USING btree ("venue_id","provider");--> statement-breakpoint
CREATE INDEX "venue_integrations_venue_idx" ON "venue_integrations" USING btree ("venue_id");