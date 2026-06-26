ALTER TABLE "venues" ADD COLUMN "street_address" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "suburb" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "postcode" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "longitude" double precision;