CREATE TABLE "care_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "care_bucket_nonnegative" CHECK ("care_buckets"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "care_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"pending_id" uuid,
	"pending_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "care_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"result" jsonb,
	"reserved_micro" integer DEFAULT 0 NOT NULL,
	"actual_micro" integer,
	"provider_calls" integer DEFAULT 0 NOT NULL,
	"settled_calls" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "care_request_nonnegative" CHECK ("care_requests"."reserved_micro" >= 0 and "care_requests"."provider_calls" between 0 and 2 and ("care_requests"."actual_micro" is null or "care_requests"."actual_micro" >= 0))
);
--> statement-breakpoint
ALTER TABLE "care_requests" ADD CONSTRAINT "care_requests_conversation_id_care_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."care_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_conversation_owner_idx" ON "care_conversations" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "care_conversation_expiry_idx" ON "care_conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "care_request_conversation_idx" ON "care_requests" USING btree ("conversation_id");