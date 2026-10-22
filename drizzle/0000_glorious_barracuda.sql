CREATE TABLE "care_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"twin_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"occurred_on" date NOT NULL,
	"origin" varchar(16) DEFAULT 'sample' NOT NULL,
	CONSTRAINT "sample_events_only" CHECK ("care_events"."origin" = 'sample'),
	CONSTRAINT "care_event_kind" CHECK ("care_events"."kind" in ('purchase', 'care', 'price', 'return'))
);
--> statement-breakpoint
CREATE TABLE "demo_customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" varchar(16) DEFAULT 'fictional' NOT NULL,
	CONSTRAINT "fictional_customer_only" CHECK ("demo_customers"."kind" = 'fictional')
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"twin_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"origin" varchar(16) DEFAULT 'sample' NOT NULL,
	CONSTRAINT "sample_documents_only" CHECK ("documents"."origin" = 'sample'),
	CONSTRAINT "document_kind" CHECK ("documents"."kind" in ('receipt', 'care-card')),
	CONSTRAINT "document_size" CHECK (length("documents"."content") between 1 and 20000)
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(16) DEFAULT 'fictional' NOT NULL,
	CONSTRAINT "fictional_merchant_only" CHECK ("merchants"."kind" = 'fictional')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"brand" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"category" varchar(40) NOT NULL,
	"illustration" varchar(20) NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	CONSTRAINT "product_merchant_identity" UNIQUE("id","merchant_id"),
	CONSTRAINT "catalog_nonnegative_price" CHECK ("products"."price_minor" >= 0),
	CONSTRAINT "catalog_usd_only" CHECK ("products"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "purchase_twins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"purchased_on" date NOT NULL,
	"purchase_price_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"origin" varchar(16) DEFAULT 'sample' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sample_twins_only" CHECK ("purchase_twins"."origin" = 'sample'),
	CONSTRAINT "purchase_nonnegative_price" CHECK ("purchase_twins"."purchase_price_minor" >= 0),
	CONSTRAINT "purchase_usd_only" CHECK ("purchase_twins"."currency" = 'USD')
);
--> statement-breakpoint
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_twin_id_purchase_twins_id_fk" FOREIGN KEY ("twin_id") REFERENCES "public"."purchase_twins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_twin_id_purchase_twins_id_fk" FOREIGN KEY ("twin_id") REFERENCES "public"."purchase_twins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_customer_id_demo_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."demo_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_twins" ADD CONSTRAINT "purchase_twins_product_id_merchant_id_products_id_merchant_id_fk" FOREIGN KEY ("product_id","merchant_id") REFERENCES "public"."products"("id","merchant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_events_twin_idx" ON "care_events" USING btree ("twin_id");--> statement-breakpoint
CREATE INDEX "documents_twin_idx" ON "documents" USING btree ("twin_id");--> statement-breakpoint
CREATE INDEX "twins_customer_idx" ON "purchase_twins" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "twins_merchant_idx" ON "purchase_twins" USING btree ("merchant_id");