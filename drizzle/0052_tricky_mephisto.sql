ALTER TABLE "orders" ADD COLUMN "points_discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "points_redeemed" integer DEFAULT 0 NOT NULL;