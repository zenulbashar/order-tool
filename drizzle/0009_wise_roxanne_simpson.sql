ALTER TABLE "order_items" ADD COLUMN "menu_item_variant_id" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_price_cents_snapshot" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_price_snapshot_nonneg" CHECK ("order_items"."variant_price_cents_snapshot" IS NULL OR "order_items"."variant_price_cents_snapshot" >= 0);