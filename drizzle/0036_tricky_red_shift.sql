ALTER TABLE "promotions" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "owner_venue_id" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_owner_venue_id_venues_id_fk" FOREIGN KEY ("owner_venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_owner_code_idx" ON "promotions" USING btree ("owner_venue_id","code") WHERE "promotions"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "promotions_code_idx" ON "promotions" USING btree ("code");