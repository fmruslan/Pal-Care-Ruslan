CREATE TABLE "care_knowledge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"brand" varchar(80) NOT NULL,
	"model" varchar(80) NOT NULL,
	"publisher" varchar(120) NOT NULL,
	"title" varchar(160) NOT NULL,
	"url" text NOT NULL,
	"section" varchar(160) NOT NULL,
	"revision" varchar(80) NOT NULL,
	"reviewed_on" date NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(20) NOT NULL,
	"language" varchar(8) NOT NULL,
	"license" varchar(40) NOT NULL,
	"tags" jsonb NOT NULL,
	CONSTRAINT "care_source_status" CHECK ("care_knowledge"."status" in ('approved','conflicting','withdrawn')),
	CONSTRAINT "care_source_size" CHECK (length("care_knowledge"."content") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "care_knowledge" ADD CONSTRAINT "care_knowledge_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_source_product_idx" ON "care_knowledge" USING btree ("product_id");