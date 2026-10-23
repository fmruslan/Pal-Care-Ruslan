CREATE TABLE "guardian_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"policy_hash" text NOT NULL,
	"price_event_id" uuid NOT NULL,
	"actor" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guardian_approvals_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "guardian_approval_bounds" CHECK ("guardian_approvals"."amount_minor" between 1 and 2000 and "guardian_approvals"."currency"='USD')
);
--> statement-breakpoint
CREATE TABLE "guardian_bindings" (
	"checkout_order_id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_hash" varchar(64) NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"twin_id" uuid NOT NULL,
	"capture_id" varchar(36) NOT NULL,
	"policy_id" uuid NOT NULL,
	"policy_hash" varchar(64) NOT NULL,
	"price_event_id" uuid NOT NULL,
	"original_minor" integer NOT NULL,
	"compared_minor" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	CONSTRAINT "guardian_cases_twin_id_unique" UNIQUE("twin_id"),
	CONSTRAINT "guardian_cases_capture_id_unique" UNIQUE("capture_id"),
	CONSTRAINT "guardian_case_amount" CHECK ("guardian_cases"."amount_minor" between 1 and 2000 and "guardian_cases"."original_minor" > "guardian_cases"."compared_minor" and "guardian_cases"."amount_minor" <= "guardian_cases"."original_minor"-"guardian_cases"."compared_minor" and "guardian_cases"."revision" > 0),
	CONSTRAINT "guardian_case_state" CHECK ("guardian_cases"."state" in ('awaiting_approval','approved','submitting','unknown','pending','completed','failed','cancelled','expired','review'))
);
--> statement-breakpoint
CREATE TABLE "guardian_checks" (
	"key" text PRIMARY KEY NOT NULL,
	"cursor" uuid,
	"last_check" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guardian_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "guardian_counter_nonnegative" CHECK ("guardian_counters"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "guardian_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dedup_key" text NOT NULL,
	"case_id" uuid,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"detail" text NOT NULL,
	"refund_operation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_events_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE TABLE "guardian_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"rules" jsonb NOT NULL,
	"terms" text NOT NULL,
	"hash" varchar(64) NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	CONSTRAINT "guardian_policies_version_unique" UNIQUE("version"),
	CONSTRAINT "guardian_policy_approval" CHECK (("guardian_policies"."approved_by" is null) = ("guardian_policies"."approved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "guardian_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "guardian_prices_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"old_minor" integer NOT NULL,
	"new_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"origin" text NOT NULL,
	"actor" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_prices_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "guardian_prices_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "guardian_price_bounds" CHECK ("guardian_prices"."old_minor" between 1 and 20000 and "guardian_prices"."new_minor" between 1 and 20000 and "guardian_prices"."currency"='USD'),
	CONSTRAINT "guardian_price_origin" CHECK ("guardian_prices"."origin" in ('controlled_demo','merchant_catalog'))
);
--> statement-breakpoint
CREATE TABLE "guardian_refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"capture_id" text NOT NULL,
	"approval_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"experiment_id" text NOT NULL,
	"attempted_at" timestamp with time zone NOT NULL,
	"refund_id" text,
	"state" text NOT NULL,
	"provider_status" text,
	"verified_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"recovery_observation" text,
	CONSTRAINT "guardian_refunds_case_id_unique" UNIQUE("case_id"),
	CONSTRAINT "guardian_refunds_capture_id_unique" UNIQUE("capture_id"),
	CONSTRAINT "guardian_refunds_request_key_unique" UNIQUE("request_key"),
	CONSTRAINT "guardian_refunds_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "guardian_refund_bounds" CHECK ("guardian_refunds"."amount_minor" between 1 and 2000 and "guardian_refunds"."currency"='USD'),
	CONSTRAINT "guardian_refund_state" CHECK ("guardian_refunds"."state" in ('submitting','unknown','pending','completed','failed','cancelled','review')),
	CONSTRAINT "guardian_refund_completed" CHECK ("guardian_refunds"."state"<>'completed' or ("guardian_refunds"."refund_id" is not null and "guardian_refunds"."provider_status"='COMPLETED' and "guardian_refunds"."verified_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "operator_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"actions" jsonb NOT NULL,
	"case_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "operator_grants_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "operator_sessions" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_approvals" ADD CONSTRAINT "guardian_approvals_case_id_guardian_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."guardian_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_approvals" ADD CONSTRAINT "guardian_approvals_price_event_id_guardian_prices_id_fk" FOREIGN KEY ("price_event_id") REFERENCES "public"."guardian_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_approvals" ADD CONSTRAINT "guardian_approvals_actor_operator_grants_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."operator_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_bindings" ADD CONSTRAINT "guardian_bindings_checkout_order_id_checkout_orders_id_fk" FOREIGN KEY ("checkout_order_id") REFERENCES "public"."checkout_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_bindings" ADD CONSTRAINT "guardian_bindings_policy_id_guardian_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."guardian_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_cases" ADD CONSTRAINT "guardian_cases_twin_id_purchase_twins_id_fk" FOREIGN KEY ("twin_id") REFERENCES "public"."purchase_twins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_cases" ADD CONSTRAINT "guardian_cases_policy_id_guardian_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."guardian_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_cases" ADD CONSTRAINT "guardian_cases_price_event_id_guardian_prices_id_fk" FOREIGN KEY ("price_event_id") REFERENCES "public"."guardian_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_events" ADD CONSTRAINT "guardian_events_case_id_guardian_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."guardian_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_events" ADD CONSTRAINT "guardian_events_refund_operation_id_guardian_refunds_id_fk" FOREIGN KEY ("refund_operation_id") REFERENCES "public"."guardian_refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_policies" ADD CONSTRAINT "guardian_policies_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_policies" ADD CONSTRAINT "guardian_policies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_policies" ADD CONSTRAINT "guardian_policies_approved_by_operator_grants_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."operator_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_prices" ADD CONSTRAINT "guardian_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_prices" ADD CONSTRAINT "guardian_prices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_refunds" ADD CONSTRAINT "guardian_refunds_case_id_guardian_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."guardian_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_refunds" ADD CONSTRAINT "guardian_refunds_approval_id_guardian_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."guardian_approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_grant_id_operator_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."operator_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_event_case_idx" ON "guardian_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "guardian_price_product_idx" ON "guardian_prices" USING btree ("product_id","sequence");