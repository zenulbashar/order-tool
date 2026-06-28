CREATE TYPE "public"."venue_plan" AS ENUM('trial', 'pro', 'scale');--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "plan" "venue_plan" DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "plan_status" text DEFAULT 'trialing' NOT NULL;