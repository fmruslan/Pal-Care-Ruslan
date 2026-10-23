-- Additive guards only. No existing row is updated, deleted, relabeled or backfilled.
CREATE FUNCTION checkout_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.session_hash,NEW.request_id,NEW.product_id,NEW.product,NEW.policy,
      NEW.payment_method_preference,NEW.return_origin,NEW.expected_payee_id,
      NEW.amount_minor,NEW.currency,NEW.create_key,NEW.capture_key,NEW.created_at,NEW.expires_at)
    IS DISTINCT FROM
     (OLD.id,OLD.session_hash,OLD.request_id,OLD.product_id,OLD.product,OLD.policy,
      OLD.payment_method_preference,OLD.return_origin,OLD.expected_payee_id,
      OLD.amount_minor,OLD.currency,OLD.create_key,OLD.capture_key,OLD.created_at,OLD.expires_at)
    OR (OLD.provider_order_id IS NOT NULL AND NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id)
    OR (OLD.observed_capture_id IS NOT NULL AND NEW.observed_capture_id IS DISTINCT FROM OLD.observed_capture_id)
    OR (OLD.provider_capture_id IS NOT NULL AND NEW.provider_capture_id IS DISTINCT FROM OLD.provider_capture_id)
    OR (OLD.capture_attempted_at IS NOT NULL AND NEW.capture_attempted_at IS DISTINCT FROM OLD.capture_attempted_at)
    OR (OLD.verified_at IS NOT NULL AND (NEW.verified_at,NEW.captured_at) IS DISTINCT FROM (OLD.verified_at,OLD.captured_at))
    OR (OLD.state='completed' AND NEW.state IS DISTINCT FROM OLD.state) THEN
    RAISE EXCEPTION 'Original checkout facts and established evidence are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER checkout_history_immutable BEFORE UPDATE ON checkout_orders FOR EACH ROW EXECUTE FUNCTION checkout_history_immutable();
--> statement-breakpoint
CREATE FUNCTION purchase_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Purchase history is immutable; append separate evidence instead' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER twin_history_immutable BEFORE UPDATE ON purchase_twins FOR EACH ROW EXECUTE FUNCTION purchase_history_immutable();
--> statement-breakpoint
CREATE TRIGGER document_history_immutable BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION purchase_history_immutable();
--> statement-breakpoint
CREATE TRIGGER care_event_history_immutable BEFORE UPDATE ON care_events FOR EACH ROW EXECUTE FUNCTION purchase_history_immutable();
