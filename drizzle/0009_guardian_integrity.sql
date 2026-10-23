-- Additive Guardian integrity. No original payment row or constraint is changed.
CREATE FUNCTION guardian_policy_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.version,NEW.merchant_id,NEW.product_id,NEW.rules,NEW.terms,NEW.hash)
     IS DISTINCT FROM (OLD.id,OLD.version,OLD.merchant_id,OLD.product_id,OLD.rules,OLD.terms,OLD.hash)
     OR (OLD.approved_at IS NOT NULL AND (NEW.approved_at,NEW.approved_by) IS DISTINCT FROM (OLD.approved_at,OLD.approved_by)) THEN
    RAISE EXCEPTION 'Guardian policy versions are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_policy_immutable BEFORE UPDATE ON guardian_policies FOR EACH ROW EXECUTE FUNCTION guardian_policy_immutable();
--> statement-breakpoint
CREATE FUNCTION guardian_binding_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Guardian bindings are immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM checkout_orders o JOIN guardian_policies p ON p.id=NEW.policy_id
    WHERE o.id=NEW.checkout_order_id AND o.policy->>'version'=p.version AND o.policy->>'content'=p.terms
    AND NEW.policy_hash=p.hash AND p.approved_at IS NOT NULL AND p.approved_at<=o.created_at
    AND o.product_id=p.product_id AND NEW.bound_at>=o.created_at) THEN
    RAISE EXCEPTION 'Guardian checkout policy binding invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_binding_integrity BEFORE INSERT OR UPDATE ON guardian_bindings FOR EACH ROW EXECUTE FUNCTION guardian_binding_integrity();
--> statement-breakpoint
CREATE FUNCTION guardian_case_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id,NEW.twin_id,NEW.capture_id,NEW.policy_id,NEW.policy_hash,NEW.original_minor,NEW.expires_at)
     IS DISTINCT FROM (OLD.id,OLD.twin_id,OLD.capture_id,OLD.policy_id,OLD.policy_hash,OLD.original_minor,OLD.expires_at) THEN
    RAISE EXCEPTION 'Guardian purchase identity is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM purchase_twins t JOIN checkout_orders o ON o.id=t.checkout_order_id JOIN guardian_bindings b ON b.checkout_order_id=o.id
    WHERE t.id=NEW.twin_id AND t.origin='sandbox' AND t.paypal_capture_id=NEW.capture_id AND o.state='completed'
    AND b.policy_id=NEW.policy_id AND b.policy_hash=NEW.policy_hash AND o.amount_minor=NEW.original_minor) THEN
    RAISE EXCEPTION 'Guardian case lacks verified covered purchase' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_case_integrity BEFORE INSERT OR UPDATE ON guardian_cases FOR EACH ROW EXECUTE FUNCTION guardian_case_integrity();
--> statement-breakpoint
CREATE FUNCTION guardian_refund_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.case_id,NEW.capture_id,NEW.approval_id,NEW.request_key,NEW.payload_hash,NEW.amount_minor,NEW.currency,NEW.experiment_id,NEW.attempted_at)
    IS DISTINCT FROM (OLD.id,OLD.case_id,OLD.capture_id,OLD.approval_id,OLD.request_key,OLD.payload_hash,OLD.amount_minor,OLD.currency,OLD.experiment_id,OLD.attempted_at)
    OR (OLD.refund_id IS NOT NULL AND NEW.refund_id IS DISTINCT FROM OLD.refund_id)
    OR (OLD.state='completed' AND (NEW.state,NEW.provider_status,NEW.verified_at) IS DISTINCT FROM (OLD.state,OLD.provider_status,OLD.verified_at)) THEN
    RAISE EXCEPTION 'Guardian refund intent and verified identity are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_refund_immutable BEFORE UPDATE ON guardian_refunds FOR EACH ROW EXECUTE FUNCTION guardian_refund_immutable();
--> statement-breakpoint
CREATE FUNCTION guardian_ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Guardian evidence is append only' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_price_append_only BEFORE UPDATE ON guardian_prices FOR EACH ROW EXECUTE FUNCTION guardian_ledger_append_only();
--> statement-breakpoint
CREATE TRIGGER guardian_approval_append_only BEFORE UPDATE ON guardian_approvals FOR EACH ROW EXECUTE FUNCTION guardian_ledger_append_only();
--> statement-breakpoint
CREATE TRIGGER guardian_event_append_only BEFORE UPDATE ON guardian_events FOR EACH ROW EXECUTE FUNCTION guardian_ledger_append_only();
--> statement-breakpoint
CREATE FUNCTION guardian_completed_event_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind='refund.completed' AND NOT EXISTS (SELECT 1 FROM guardian_refunds r WHERE r.id=NEW.refund_operation_id AND r.case_id=NEW.case_id AND r.state='completed' AND r.provider_status='COMPLETED' AND r.refund_id IS NOT NULL AND r.verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Completed Guardian event requires verified operation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guardian_completed_event_integrity BEFORE INSERT ON guardian_events FOR EACH ROW EXECUTE FUNCTION guardian_completed_event_integrity();
