CREATE TYPE "public"."promotion_audience" AS ENUM('all', 'new');--> statement-breakpoint
CREATE TYPE "public"."promotion_scope" AS ENUM('all', 'selected');--> statement-breakpoint
CREATE TABLE "promotion_venues" (
	"id" text PRIMARY KEY NOT NULL,
	"promotion_id" text NOT NULL,
	"venue_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "scope" "promotion_scope" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "audience" "promotion_audience" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "budget_cents" integer;--> statement-breakpoint
ALTER TABLE "promotion_venues" ADD CONSTRAINT "promotion_venues_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_venues" ADD CONSTRAINT "promotion_venues_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_venues_pair_idx" ON "promotion_venues" USING btree ("promotion_id","venue_id");--> statement-breakpoint
CREATE INDEX "promotion_venues_venue_idx" ON "promotion_venues" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "orders_applied_promo_idx" ON "orders" USING btree ("applied_promo_id");--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_budget_pos" CHECK ("promotions"."budget_cents" IS NULL OR "promotions"."budget_cents" > 0);