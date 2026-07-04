CREATE TYPE "public"."promotion_funding" AS ENUM('merchant', 'platform', 'cofunded');--> statement-breakpoint
CREATE TYPE "public"."promotion_type" AS ENUM('percent', 'amount');--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "promotion_type" NOT NULL,
	"value" integer NOT NULL,
	"min_basket_cents" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"funding_source" "promotion_funding" DEFAULT 'merchant' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_value_pos" CHECK ("promotions"."value" > 0),
	CONSTRAINT "promotions_min_basket_nonneg" CHECK ("promotions"."min_basket_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "applied_promo_id" text;--> statement-breakpoint
CREATE INDEX "promotions_active_idx" ON "promotions" USING btree ("is_active");