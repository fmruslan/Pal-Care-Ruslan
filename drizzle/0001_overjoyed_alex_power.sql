CREATE TABLE "checkout_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"return_origin" text NOT NULL,
	"expected_payee_id" varchar(13) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"state" varchar(24) DEFAULT 'creating' NOT NULL,
	"create_key" uuid NOT NULL,
	"capture_key" uuid NOT NULL,
	"provider_order_id" varchar(36),
	"provider_capture_id" varchar(36),
	"approval_url" text,
	"capture_attempted_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"last_error" varchar(40),
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "checkout_orders_create_key_unique" UNIQUE("create_key"),
	CONSTRAINT "checkout_orders_capture_key_unique" UNIQUE("capture_key"),
	CONSTRAINT "checkout_orders_provider_order_id_unique" UNIQUE("provider_order_id"),
	CONSTRAINT "checkout_orders_provider_capture_id_unique" UNIQUE("provider_capture_id"),
	CONSTRAINT "checkout_session_request" UNIQUE("session_hash","request_id"),
	CONSTRAINT "checkout_verified_identity" UNIQUE("id","provider_order_id","provider_capture_id"),
	CONSTRAINT "checkout_amount" CHECK ("checkout_orders"."amount_minor" between 1 and 20000 and "checkout_orders"."currency" = 'USD'),
	CONSTRAINT "checkout_state" CHECK ("checkout_orders"."state" in ('creating','create_unknown','created','capturing','pending','completed','cancelled','failed','review')),
	CONSTRAINT "checkout_completed_evidence" CHECK ("checkout_orders"."state" <> 'completed' or ("checkout_orders"."provider_order_id" is not null and "checkout_orders"."provider_capture_id" is not null and "checkout_orders"."verified_at" is not null and "checkout_orders"."captured_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "checkout_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "checkout_rate_count" CHECK ("checkout_rate_limits"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "care_events" DROP CONSTRAINT "sample_events_only";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "sample_documents_only";--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "document_kind";--> statement-breakpoint
ALTER TABLE "purchase_twins" DROP CONSTRAINT "sample_twins_only";--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD COLUMN "checkout_order_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD COLUMN "paypal_order_id" varchar(36);--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD COLUMN "paypal_capture_id" varchar(36);--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD COLUMN "product_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_checkout_order_id_paypal_order_id_paypal_capture_id_checkout_orders_id_provider_order_id_provider_capture_id_fk" FOREIGN KEY ("checkout_order_id","paypal_order_id","paypal_capture_id") REFERENCES "public"."checkout_orders"("id","provider_order_id","provider_capture_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_checkout_order_id_unique" UNIQUE("checkout_order_id");--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_paypal_order_id_unique" UNIQUE("paypal_order_id");--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_paypal_capture_id_unique" UNIQUE("paypal_capture_id");--> statement-breakpoint
ALTER TABLE "care_events" ADD CONSTRAINT "event_provenance" CHECK ("care_events"."origin" = 'sample' or ("care_events"."origin" = 'sandbox' and "care_events"."kind" = 'purchase'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_provenance" CHECK ("documents"."origin" in ('sample','sandbox') and ("documents"."origin" <> 'sandbox' or "documents"."kind" = 'receipt'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "document_kind" CHECK ("documents"."kind" in ('receipt', 'care-card', 'policy'));--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "twin_payment_provenance" CHECK (("purchase_twins"."origin" = 'sample' and "purchase_twins"."checkout_order_id" is null and "purchase_twins"."paypal_order_id" is null and "purchase_twins"."paypal_capture_id" is null and "purchase_twins"."verified_at" is null and "purchase_twins"."product_snapshot" is null) or ("purchase_twins"."origin" = 'sandbox' and "purchase_twins"."checkout_order_id" is not null and "purchase_twins"."paypal_order_id" is not null and "purchase_twins"."paypal_capture_id" is not null and "purchase_twins"."verified_at" is not null and "purchase_twins"."product_snapshot" is not null));