CREATE TABLE "discovery_products" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_category" CHECK ("discovery_products"."category" in ('headphones','air-fryer'))
);
--> statement-breakpoint
CREATE TABLE "discovery_usage" (
	"key" text PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "discovery_positive_budget" CHECK ("discovery_usage"."amount">0)
);
