CREATE TYPE "public"."plan_discount_mode" AS ENUM('off', 'percent', 'amount');--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "plan_discount_mode" "plan_discount_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "plan_discount_value" integer DEFAULT 0 NOT NULL;