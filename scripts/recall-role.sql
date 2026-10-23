-- Private ingestion capability, not a web endpoint or permission to change purchases.
CREATE ROLE palcare_recall NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO palcare_recall;
GRANT SELECT ON purchase_twins,recall_sources,recall_checks,recall_assessments TO palcare_recall;
GRANT INSERT ON recall_sources,recall_assessments TO palcare_recall;
GRANT INSERT,UPDATE ON recall_checks TO palcare_recall;
