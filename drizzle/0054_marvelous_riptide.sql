ALTER TABLE "orders" ADD COLUMN "gift_card_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gift_card_redeemed_cents" integer DEFAULT 0 NOT NULL;