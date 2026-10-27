-- Preserve every existing reservation/cost/bucket. Old 40000 unknown calls are
-- not reclassified or released. No commerce table or role is altered here.
ALTER TABLE "care_model_calls" DROP CONSTRAINT "care_call_bounds";--> statement-breakpoint
ALTER TABLE "care_model_calls" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "care_model_calls" ADD CONSTRAINT "care_call_bounds" CHECK ("care_model_calls"."call" between 1 and 2 and "care_model_calls"."reserved_micro" in (40000,120000) and ("care_model_calls"."actual_micro" is null or "care_model_calls"."actual_micro" between 0 and "care_model_calls"."reserved_micro") and (("care_model_calls"."actual_micro" is null) = ("care_model_calls"."settled_at" is null)));
