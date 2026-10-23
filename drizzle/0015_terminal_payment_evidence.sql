-- Additive follow-up: completed purchase observations cannot be downgraded by a
-- future checkout writer. Aftercare refunds use their separate ledger.
CREATE FUNCTION checkout_terminal_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.approval_url IS NOT NULL AND NEW.approval_url IS DISTINCT FROM OLD.approval_url)
    OR (OLD.state='completed' AND
      (NEW.capture_status,NEW.capture_pending_reason) IS DISTINCT FROM
      (OLD.capture_status,OLD.capture_pending_reason)) THEN
    RAISE EXCEPTION 'Established approval and completed capture evidence are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER checkout_terminal_evidence_guard BEFORE UPDATE ON checkout_orders FOR EACH ROW EXECUTE FUNCTION checkout_terminal_evidence_guard();
