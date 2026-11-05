-- PROPOSAL ONLY. Not authorized by the previous Care migration approval.
-- Selected additive lane; never apply root 0016 or change old grants/records.
CREATE ROLE palcare_protection_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE palcare_protection_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Fixed-scope, read-only projection. No session hashes, credentials, payer data,
-- payment mutation capability, or general base-table grants reach these roles.
CREATE VIEW care_protection_inputs WITH (security_barrier=true) AS
SELECT t.id AS twin_id, t.merchant_id, t.product_id, t.origin,
       t.purchased_on, t.purchase_price_minor, t.currency,
       t.verified_at, t.created_at AS purchase_recorded_at,
       coalesce(t.product_snapshot->>'brand',p.brand) AS brand,
       coalesce(t.product_snapshot->>'model',p.model) AS model,
       p.brand AS catalog_brand, p.model AS catalog_model,
       p.price_minor AS catalog_minor, p.currency AS catalog_currency,
       o.created_at AS order_created_at, o.captured_at,
       b.bound_at, b.policy_hash AS binding_hash,
       gp.version AS policy_version, gp.rules AS policy_rules,
       gp.terms AS policy_terms, gp.hash AS policy_hash, gp.approved_at,
       coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'content',d.content)
                    ORDER BY d.id) FROM documents d
                 WHERE d.twin_id=t.id AND d.kind='policy'),'[]'::jsonb) AS policy_documents,
       EXISTS(SELECT 1 FROM guardian_cases c WHERE c.twin_id=t.id) AS has_prior_adjustment
FROM purchase_twins t
JOIN products p ON p.id=t.product_id AND p.merchant_id=t.merchant_id
LEFT JOIN checkout_orders o ON o.id=t.checkout_order_id
LEFT JOIN guardian_bindings b ON b.checkout_order_id=o.id
LEFT JOIN guardian_policies gp ON gp.id=b.policy_id AND gp.merchant_id=t.merchant_id
                               AND gp.product_id=t.product_id
WHERE t.customer_id='00000000-0000-4000-8000-000000000001'::uuid
  AND t.merchant_id='00000000-0000-4000-8000-000000000002'::uuid;
REVOKE ALL ON care_protection_inputs FROM PUBLIC;

CREATE TABLE care_protection_jobs (
  twin_id uuid PRIMARY KEY REFERENCES purchase_twins(id),
  state varchar(24) NOT NULL DEFAULT 'queued'
    CHECK(state IN ('queued','supported','unavailable','expired','error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  next_check_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  checks integer NOT NULL DEFAULT 0 CHECK(checks BETWEEN 0 AND 10000)
);
CREATE INDEX care_protection_due_idx ON care_protection_jobs(next_check_at,twin_id);

CREATE TABLE care_protection_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid NOT NULL REFERENCES care_protection_jobs(twin_id),
  kind varchar(24) NOT NULL CHECK(kind IN ('policy','catalog','unavailable')),
  source varchar(32) NOT NULL CHECK(source IN ('purchase-policy','forma-catalog','unavailable')),
  source_url text NOT NULL CHECK(length(source_url)<=300 AND
    source_url ~ '^/(documents/[a-f0-9-]{36}|care/[a-f0-9-]{36}#price|shop)$'),
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object' AND octet_length(facts::text)<=20000),
  content_hash varchar(64) NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  dedup_key varchar(200) NOT NULL,
  UNIQUE(twin_id,dedup_key),
  UNIQUE(twin_id,id),
  CHECK((kind='policy' AND source='purchase-policy') OR
        (kind='catalog' AND source='forma-catalog') OR
        (kind='unavailable' AND source='unavailable'))
);
CREATE INDEX care_protection_evidence_twin_idx ON care_protection_evidence(twin_id,retrieved_at,id);

CREATE TABLE care_protection_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twin_id uuid NOT NULL REFERENCES care_protection_jobs(twin_id),
  evidence_id uuid NOT NULL,
  kind varchar(24) NOT NULL CHECK(kind IN ('opportunity','window-ending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(twin_id,kind,evidence_id),
  FOREIGN KEY(twin_id,evidence_id) REFERENCES care_protection_evidence(twin_id,id)
);

-- Source evidence/notifications are append-only, including for the new worker.
CREATE FUNCTION care_protection_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'care_protection_evidence_is_immutable';
END;
$$;
REVOKE ALL ON FUNCTION care_protection_immutable() FROM PUBLIC;
CREATE TRIGGER care_protection_evidence_immutable BEFORE UPDATE OR DELETE ON care_protection_evidence
FOR EACH ROW EXECUTE FUNCTION care_protection_immutable();
CREATE TRIGGER care_protection_notifications_immutable BEFORE UPDATE OR DELETE ON care_protection_notifications
FOR EACH ROW EXECUTE FUNCTION care_protection_immutable();

REVOKE ALL ON care_protection_jobs,care_protection_evidence,care_protection_notifications FROM PUBLIC;
ALTER TABLE care_protection_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_protection_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_protection_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY protection_job_scope ON care_protection_jobs
TO palcare_protection_reader,palcare_protection_worker
USING(EXISTS(SELECT 1 FROM care_protection_inputs i WHERE i.twin_id=care_protection_jobs.twin_id))
WITH CHECK(EXISTS(SELECT 1 FROM care_protection_inputs i WHERE i.twin_id=care_protection_jobs.twin_id));
CREATE POLICY protection_evidence_scope ON care_protection_evidence
TO palcare_protection_reader,palcare_protection_worker
USING(EXISTS(SELECT 1 FROM care_protection_jobs j WHERE j.twin_id=care_protection_evidence.twin_id))
WITH CHECK(EXISTS(SELECT 1 FROM care_protection_jobs j WHERE j.twin_id=care_protection_evidence.twin_id));
CREATE POLICY protection_notification_scope ON care_protection_notifications
TO palcare_protection_reader,palcare_protection_worker
USING(EXISTS(SELECT 1 FROM care_protection_jobs j WHERE j.twin_id=care_protection_notifications.twin_id))
WITH CHECK(EXISTS(SELECT 1 FROM care_protection_jobs j WHERE j.twin_id=care_protection_notifications.twin_id));

GRANT SELECT ON care_protection_inputs,care_protection_jobs,care_protection_evidence,
  care_protection_notifications TO palcare_protection_reader,palcare_protection_worker;
GRANT INSERT(twin_id) ON care_protection_jobs TO palcare_protection_worker;
GRANT UPDATE(state,next_check_at,last_checked_at,checks) ON care_protection_jobs TO palcare_protection_worker;
GRANT INSERT(twin_id,kind,source,source_url,facts,content_hash,dedup_key)
  ON care_protection_evidence TO palcare_protection_worker;
GRANT INSERT(twin_id,evidence_id,kind) ON care_protection_notifications TO palcare_protection_worker;
-- Independent LOGIN provisioning/CONNECT/schema USAGE is separate and private.
-- Existing logins, memberships, grants, policies, payments and accounting unchanged.
