CREATE TABLE "recall_assessments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"twin_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recall_assessment_once" UNIQUE("twin_id","source_hash","engine_version"),
	CONSTRAINT "recall_assessment_state" CHECK ("recall_assessments"."state" in ('not_assessed','possible_match','identifiers_match','more_information','no_match'))
);
--> statement-breakpoint
CREATE TABLE "recall_checks" (
	"key" text PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"source_hash" text,
	CONSTRAINT "recall_check_state" CHECK ("recall_checks"."state" in ('available','unavailable'))
);
--> statement-breakpoint
CREATE TABLE "recall_sources" (
	"hash" text PRIMARY KEY NOT NULL,
	"recall_number" text NOT NULL,
	"source" jsonb NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"endpoint" text NOT NULL,
	CONSTRAINT "recall_hash_shape" CHECK ("recall_sources"."hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "recall_assessments" ADD CONSTRAINT "recall_assessments_twin_id_purchase_twins_id_fk" FOREIGN KEY ("twin_id") REFERENCES "public"."purchase_twins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_assessments" ADD CONSTRAINT "recall_assessments_source_hash_recall_sources_hash_fk" FOREIGN KEY ("source_hash") REFERENCES "public"."recall_sources"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recall_checks" ADD CONSTRAINT "recall_checks_source_hash_recall_sources_hash_fk" FOREIGN KEY ("source_hash") REFERENCES "public"."recall_sources"("hash") ON DELETE no action ON UPDATE no action;