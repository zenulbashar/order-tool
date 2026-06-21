ALTER TABLE "venues" ADD COLUMN "brand_color" text DEFAULT '#111827' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "storefront_description" text;