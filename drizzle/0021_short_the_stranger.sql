CREATE TYPE "public"."recipe_unit" AS ENUM('g', 'ml', 'each');--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" "recipe_unit" NOT NULL,
	"pack_size" double precision,
	"pack_cost_cents" integer,
	"yield_pct" integer DEFAULT 100 NOT NULL,
	"supplier" text,
	"is_packaging" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_pack_size_pos" CHECK ("ingredients"."pack_size" IS NULL OR "ingredients"."pack_size" > 0),
	CONSTRAINT "ingredients_pack_cost_nonneg" CHECK ("ingredients"."pack_cost_cents" IS NULL OR "ingredients"."pack_cost_cents" >= 0),
	CONSTRAINT "ingredients_yield_pct_range" CHECK ("ingredients"."yield_pct" >= 1 AND "ingredients"."yield_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredients_venue_idx" ON "ingredients" USING btree ("venue_id");