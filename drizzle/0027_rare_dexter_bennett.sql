CREATE TYPE "public"."payto_discount_mode" AS ENUM('off', 'flat', 'percent');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "payto_discount_mode" "payto_discount_mode" DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "payto_discount_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_cents_nonneg" CHECK ("orders"."discount_cents" >= 0);