ALTER TABLE "checkout_orders" DROP CONSTRAINT "checkout_capture_observation";--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD COLUMN "observed_capture_id" varchar(36);--> statement-breakpoint
-- Preserve existing provider identities verbatim; do not fabricate status or payment proof.
UPDATE "checkout_orders" SET "observed_capture_id" = "provider_capture_id" WHERE "provider_capture_id" IS NOT NULL;--> statement-breakpoint
-- Unverified observations do not occupy the completed-payment FK evidence slot.
UPDATE "checkout_orders" SET "provider_capture_id" = NULL
WHERE "state" <> 'completed' AND "capture_status" IS NOT NULL
  AND "verified_at" IS NULL AND "captured_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "purchase_twins" WHERE "checkout_order_id" = "checkout_orders"."id");--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_observed_capture_id_unique" UNIQUE("observed_capture_id");--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_capture_identity" CHECK ("checkout_orders"."observed_capture_id" is null or "checkout_orders"."provider_capture_id" is null or "checkout_orders"."observed_capture_id" = "checkout_orders"."provider_capture_id");--> statement-breakpoint
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_capture_observation" CHECK ("checkout_orders"."capture_status" is null or ("checkout_orders"."capture_status" in ('PENDING','COMPLETED','FAILED','DECLINED') and "checkout_orders"."observed_capture_id" is not null and "checkout_orders"."capture_checked_at" is not null));
