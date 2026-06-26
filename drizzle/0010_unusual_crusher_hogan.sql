CREATE TABLE "customer_login_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "customer_login_tokens" ADD CONSTRAINT "customer_login_tokens_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_login_tokens_token_hash_idx" ON "customer_login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_login_tokens_venue_email_idx" ON "customer_login_tokens" USING btree ("venue_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_sessions_token_hash_idx" ON "customer_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_venue_idx" ON "customer_sessions" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_venue_email_lower_idx" ON "customers" USING btree ("venue_id",lower("email"));--> statement-breakpoint
CREATE INDEX "customers_venue_idx" ON "customers" USING btree ("venue_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_created_idx" ON "orders" USING btree ("customer_id","created_at");