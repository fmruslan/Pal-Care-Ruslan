-- PROPOSED ONLY. Not registered in the migration journal; do not auto-apply.
-- Requires exact owner approval, dedicated-DB proof and reviewed Drizzle metadata.
-- Deliberately does not run pending 0016 or touch original evidence tables.
BEGIN;

CREATE TABLE care_cases (
  id uuid PRIMARY KEY,
  twin_id uuid NOT NULL REFERENCES purchase_twins(id),
  kind varchar(16) NOT NULL CHECK (kind IN ('return','warranty')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,twin_id)
);
CREATE TABLE care_case_events (
  id uuid PRIMARY KEY,
  case_id uuid NOT NULL,
  twin_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  state varchar(24) NOT NULL CHECK (state IN ('prepared','requested','accepted','shipped','received','closed','rejected','cancelled','warranty_terms')),
  source_kind varchar(16) NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual','sample','external')),
  source_reference varchar(200) NOT NULL,
  effective_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object' AND octet_length(facts::text) <= 4096),
  FOREIGN KEY(case_id,twin_id) REFERENCES care_cases(id,twin_id),
  UNIQUE(case_id,revision),
  UNIQUE(case_id,source_kind,source_reference)
);
CREATE TABLE care_watches (
  id uuid PRIMARY KEY,
  twin_id uuid NOT NULL UNIQUE REFERENCES purchase_twins(id),
  source varchar(24) NOT NULL DEFAULT 'merchant_catalog' CHECK (source = 'merchant_catalog'),
  state varchar(16) NOT NULL DEFAULT 'saved' CHECK (state IN ('saved','active','paused','error','expired')),
  cadence_seconds integer NOT NULL DEFAULT 86400 CHECK (cadence_seconds = 86400),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  observed_minor integer CHECK (observed_minor > 0 AND observed_minor <= 20000),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CHECK (state <> 'active' OR (last_checked_at IS NOT NULL AND next_check_at IS NOT NULL AND observed_minor IS NOT NULL)),
  CHECK (last_checked_at IS NULL OR next_check_at > last_checked_at)
);
CREATE INDEX care_events_timeline ON care_case_events(case_id,effective_on,recorded_at,id);
CREATE INDEX care_watches_due ON care_watches(next_check_at) WHERE state IN ('saved','active','error');

-- Invoker-only functions, no SECURITY DEFINER privileges.
CREATE FUNCTION care_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Care case evidence is append-only'; END $$;
CREATE TRIGGER care_cases_immutable BEFORE UPDATE OR DELETE ON care_cases FOR EACH ROW EXECUTE FUNCTION care_append_only();
CREATE TRIGGER care_case_events_immutable BEFORE UPDATE OR DELETE ON care_case_events FOR EACH ROW EXECUTE FUNCTION care_append_only();
REVOKE ALL ON FUNCTION care_append_only() FROM PUBLIC;
REVOKE ALL ON care_cases,care_case_events,care_watches FROM PUBLIC;

-- NOLOGIN groups only. Actual LOGIN credentials/membership are separate approval.
CREATE ROLE palcare_care_reporter NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE palcare_care_watch_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE palcare_care_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO palcare_care_reader,palcare_care_reporter,palcare_care_watch_worker;
GRANT SELECT ON care_cases,care_case_events,care_watches TO palcare_care_reader,palcare_care_reporter,palcare_care_watch_worker;
GRANT SELECT ON purchase_twins TO palcare_care_reader;
GRANT SELECT ON demo_customers,merchants,products,purchase_twins TO palcare_care_reporter,palcare_care_watch_worker;
GRANT INSERT(id,twin_id,kind) ON care_cases TO palcare_care_reporter;
GRANT INSERT(id,case_id,twin_id,revision,state,source_reference,effective_on,facts) ON care_case_events TO palcare_care_reporter;
GRANT INSERT(id,twin_id,expires_at) ON care_watches TO palcare_care_reporter;
GRANT UPDATE(state,last_checked_at,next_check_at,observed_minor) ON care_watches TO palcare_care_watch_worker;

ALTER TABLE care_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_case_read ON care_cases FOR SELECT TO palcare_care_reader,palcare_care_reporter,palcare_care_watch_worker USING (EXISTS (SELECT 1 FROM purchase_twins t WHERE t.id=twin_id AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002'));
CREATE POLICY care_case_report ON care_cases FOR INSERT TO palcare_care_reporter WITH CHECK (EXISTS (SELECT 1 FROM purchase_twins t WHERE t.id=twin_id AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002'));
CREATE POLICY care_event_read ON care_case_events FOR SELECT TO palcare_care_reader,palcare_care_reporter,palcare_care_watch_worker USING (EXISTS (SELECT 1 FROM care_cases c WHERE c.id=case_id AND c.twin_id=care_case_events.twin_id));
CREATE POLICY care_event_report ON care_case_events FOR INSERT TO palcare_care_reporter WITH CHECK (source_kind='manual' AND EXISTS (SELECT 1 FROM care_cases c WHERE c.id=case_id AND c.twin_id=care_case_events.twin_id));
CREATE POLICY care_watch_read ON care_watches FOR SELECT TO palcare_care_reader,palcare_care_reporter,palcare_care_watch_worker USING (EXISTS (SELECT 1 FROM purchase_twins t WHERE t.id=twin_id AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002'));
CREATE POLICY care_watch_save ON care_watches FOR INSERT TO palcare_care_reporter WITH CHECK (state='saved' AND source='merchant_catalog' AND EXISTS (SELECT 1 FROM purchase_twins t WHERE t.id=twin_id AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002' AND t.product_id='00000000-0000-4000-8000-000000000101'));
CREATE POLICY care_watch_check ON care_watches FOR UPDATE TO palcare_care_watch_worker USING (source='merchant_catalog') WITH CHECK (source='merchant_catalog');
COMMIT;
