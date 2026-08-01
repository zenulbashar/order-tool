CREATE TYPE "public"."venue_role_key" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TABLE "venue_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "venue_role_key" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_member_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "venue_role_key" NOT NULL,
	"granted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "venue_invitations" ADD CONSTRAINT "venue_invitations_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_invitations" ADD CONSTRAINT "venue_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_member_roles" ADD CONSTRAINT "venue_member_roles_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_member_roles" ADD CONSTRAINT "venue_member_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_member_roles" ADD CONSTRAINT "venue_member_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_invitations_token_hash_idx" ON "venue_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "venue_invitations_venue_idx" ON "venue_invitations" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "venue_invitations_email_idx" ON "venue_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_member_roles_venue_user_role_idx" ON "venue_member_roles" USING btree ("venue_id","user_id","role");--> statement-breakpoint
CREATE INDEX "venue_member_roles_venue_user_idx" ON "venue_member_roles" USING btree ("venue_id","user_id");