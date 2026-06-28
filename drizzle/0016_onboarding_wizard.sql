CREATE TYPE "public"."venue_type" AS ENUM('cafe', 'restaurant', 'bar', 'bakery', 'food_truck');--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "venue_type" "venue_type";--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "onboarding_step" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "offers_dine_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "offers_takeaway" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "offers_delivery" boolean DEFAULT false NOT NULL;