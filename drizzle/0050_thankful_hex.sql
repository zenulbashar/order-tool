CREATE TYPE "public"."menu_item_station" AS ENUM('auto', 'kitchen', 'counter');--> statement-breakpoint
ALTER TABLE "menu_items" ADD COLUMN "station" "menu_item_station" DEFAULT 'auto' NOT NULL;