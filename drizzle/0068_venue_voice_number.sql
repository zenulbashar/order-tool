ALTER TABLE "venues" ADD COLUMN "voice_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "venues_voice_number_idx" ON "venues" USING btree ("voice_number");