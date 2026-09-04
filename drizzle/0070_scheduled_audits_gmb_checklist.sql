ALTER TABLE "seo_audits" ADD COLUMN "trigger" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "gmb_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;