-- Operator-reviewed capability only. Provision an independent LOGIN privately.
-- Never grant runtime login membership in an owner/migration role, even NOINHERIT.
CREATE ROLE palcare_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO palcare_reader;
GRANT SELECT ON demo_customers,merchants,products,purchase_twins,documents,care_events,care_knowledge,guardian_cases,guardian_policies,guardian_prices,guardian_refunds,guardian_approvals,guardian_events,guardian_checks,recall_sources,recall_checks,recall_assessments TO palcare_reader;
