-- Recall evidence is append-only; corrections use a new source hash / engine version.
-- No original purchase, checkout, Guardian or policy row is changed.
CREATE FUNCTION recall_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recall evidence is immutable; append a new revision' USING ERRCODE='23514'; END $$;
--> statement-breakpoint
CREATE TRIGGER recall_source_immutable BEFORE UPDATE ON recall_sources FOR EACH ROW EXECUTE FUNCTION recall_evidence_immutable();
--> statement-breakpoint
CREATE TRIGGER recall_assessment_immutable BEFORE UPDATE ON recall_assessments FOR EACH ROW EXECUTE FUNCTION recall_evidence_immutable();
