CREATE TABLE "care_model_calls" (
	"request_id" uuid NOT NULL,
	"call" integer NOT NULL,
	"reserved_micro" integer NOT NULL,
	"bucket_keys" jsonb NOT NULL,
	"actual_micro" integer,
	"settled_at" timestamp with time zone,
	CONSTRAINT "care_model_calls_request_id_call_pk" PRIMARY KEY("request_id","call"),
	CONSTRAINT "care_call_bounds" CHECK ("care_model_calls"."call" between 1 and 2 and "care_model_calls"."reserved_micro"=40000 and ("care_model_calls"."actual_micro" is null or "care_model_calls"."actual_micro" between 0 and "care_model_calls"."reserved_micro") and (("care_model_calls"."actual_micro" is null) = ("care_model_calls"."settled_at" is null)))
);
--> statement-breakpoint
ALTER TABLE "care_model_calls" ADD CONSTRAINT "care_model_calls_request_id_care_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."care_requests"("id") ON DELETE cascade ON UPDATE no action;