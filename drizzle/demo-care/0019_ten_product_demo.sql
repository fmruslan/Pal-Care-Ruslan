-- Proposed selected lane only. No existing records/roles/grants are altered.
CREATE TABLE care_demo_packs (
  id uuid PRIMARY KEY CHECK (id='00000000-0000-4000-8000-000000000900'),
  version text NOT NULL CHECK (version='care-ten-v1'),
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  customer_id uuid NOT NULL REFERENCES demo_customers(id) CHECK (customer_id='00000000-0000-4000-8000-000000000001'),
  merchant_id uuid NOT NULL REFERENCES merchants(id) CHECK (merchant_id='00000000-0000-4000-8000-000000000002')
);
--> statement-breakpoint
CREATE TABLE care_demo_evidence (
  id uuid PRIMARY KEY,
  pack_id uuid NOT NULL REFERENCES care_demo_packs(id),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 19),
  product_id uuid NOT NULL REFERENCES products(id),
  twin_id uuid REFERENCES purchase_twins(id),
  document_id uuid REFERENCES documents(id),
  kind text NOT NULL CHECK (kind IN ('retail-reference','warranty','return-window','delivery','safety','price','gap')),
  provenance text NOT NULL CHECK (provenance IN ('retail-reference','simulated')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text) <= 20000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pack_id,ordinal),
  CHECK ((kind='retail-reference' AND provenance='retail-reference' AND twin_id IS NULL AND document_id IS NULL) OR
    (kind<>'retail-reference' AND provenance='simulated' AND twin_id IS NOT NULL AND document_id IS NOT NULL AND payload->'simulated'='true'::jsonb))
);
--> statement-breakpoint
CREATE FUNCTION care_demo_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'demo_evidence_immutable'; END IF;
  IF TG_TABLE_NAME='care_demo_evidence' THEN
    IF NEW.payload->>'id' IS DISTINCT FROM NEW.id::text OR NEW.payload->>'productId' IS DISTINCT FROM NEW.product_id::text OR NEW.payload->>'kind' IS DISTINCT FROM NEW.kind THEN
      RAISE EXCEPTION 'demo_identity_mismatch';
    END IF;
    IF NEW.provenance='simulated' AND NOT EXISTS (
      SELECT 1 FROM purchase_twins t JOIN documents d ON d.twin_id=t.id
      WHERE t.id=NEW.twin_id AND t.product_id=NEW.product_id AND t.origin='sample'
        AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002'
        AND d.id=NEW.document_id AND d.origin='sample' AND d.kind='care-card'
        AND NEW.payload->>'twinId'=t.id::text AND NEW.payload->>'documentId'=d.id::text
    ) THEN RAISE EXCEPTION 'demo_binding_mismatch'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER care_demo_pack_immutable BEFORE UPDATE OR DELETE ON care_demo_packs FOR EACH ROW EXECUTE FUNCTION care_demo_integrity();
--> statement-breakpoint
CREATE TRIGGER care_demo_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON care_demo_evidence FOR EACH ROW EXECUTE FUNCTION care_demo_integrity();
--> statement-breakpoint
REVOKE ALL ON care_demo_packs,care_demo_evidence FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION care_demo_integrity() FROM PUBLIC;
