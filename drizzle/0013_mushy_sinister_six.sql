ALTER TABLE "orders" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "scheduling_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "scheduling_lead_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "scheduling_max_days_ahead" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_scheduling_lead_minutes_nonneg" CHECK ("venues"."scheduling_lead_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_scheduling_max_days_ahead_nonneg" CHECK ("venues"."scheduling_max_days_ahead" >= 0);