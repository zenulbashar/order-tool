CREATE TABLE "venue_order_sequences" (
	"venue_id" text NOT NULL,
	"service_date" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "venue_order_sequences_venue_id_service_date_pk" PRIMARY KEY("venue_id","service_date")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "daily_number" integer;--> statement-breakpoint
ALTER TABLE "venue_order_sequences" ADD CONSTRAINT "venue_order_sequences_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;