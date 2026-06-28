ALTER TYPE "public"."venue_plan" ADD VALUE 'free';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "venues_stripe_customer_id_idx" ON "venues" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_stripe_subscription_id_idx" ON "venues" USING btree ("stripe_subscription_id");