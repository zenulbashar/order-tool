CREATE TABLE "sweep_watermarks" (
	"name" text PRIMARY KEY NOT NULL,
	"last_swept_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
