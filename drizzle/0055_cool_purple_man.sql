CREATE TYPE "public"."support_department" AS ENUM('tech', 'sales', 'billing');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('open', 'replied', 'closed');--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"foundry_ticket_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"department" "support_department" NOT NULL,
	"summary" text NOT NULL,
	"status" "support_ticket_status" DEFAULT 'open' NOT NULL,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_foundry_idx" ON "support_tickets" USING btree ("foundry_ticket_id");--> statement-breakpoint
CREATE INDEX "support_tickets_venue_idx" ON "support_tickets" USING btree ("venue_id");