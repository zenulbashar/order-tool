ALTER TABLE "customers" ADD COLUMN "notify_order_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notify_order_sms" boolean DEFAULT false NOT NULL;