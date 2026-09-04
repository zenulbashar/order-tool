CREATE TABLE "order_push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"subscription" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_push_subscriptions" ADD CONSTRAINT "order_push_subscriptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_push_subscriptions_order_sub_idx" ON "order_push_subscriptions" USING btree ("order_id","subscription");