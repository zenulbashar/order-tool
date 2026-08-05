CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'seated', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"public_token" text NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"booked_for" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text,
	"notes" text,
	"table_id" text,
	"seated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_party_size_min1" CHECK ("bookings"."party_size" >= 1)
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "bookings_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "booking_lead_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "booking_max_days_ahead" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "booking_max_party_size" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "booking_duration_minutes" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_id_venue_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."venue_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_public_token_idx" ON "bookings" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "bookings_venue_booked_for_idx" ON "bookings" USING btree ("venue_id","booked_for");