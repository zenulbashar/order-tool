CREATE TABLE "shop_category_settings" (
	"category" text PRIMARY KEY NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product_overrides" (
	"mmt_code" text PRIMARY KEY NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"price_override_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_price_override_nonneg" CHECK ("shop_product_overrides"."price_override_cents" IS NULL OR "shop_product_overrides"."price_override_cents" >= 0)
);
