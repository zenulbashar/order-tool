ALTER TABLE "platform_audit_log" ADD COLUMN "venue_id" text;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD COLUMN "actor_user_id" text;--> statement-breakpoint
ALTER TABLE "platform_audit_log" ADD CONSTRAINT "platform_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_audit_venue_created_idx" ON "platform_audit_log" USING btree ("venue_id","created_at");