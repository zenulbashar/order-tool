ALTER TABLE "orders" ADD COLUMN "platform_funded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "platform_funded_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_platform_funded_range" CHECK ("promotions"."platform_funded_percent" >= 0 AND "promotions"."platform_funded_percent" <= 100);