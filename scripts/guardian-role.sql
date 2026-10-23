-- Apply only after reviewed migrations. Configure LOGIN/password privately;
-- no password or deployment is created by this repository file.
CREATE ROLE palcare_guardian NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO palcare_guardian;
GRANT SELECT ON checkout_orders,purchase_twins,documents,care_events,products,merchants,guardian_bindings,guardian_policies,operator_grants TO palcare_guardian;
GRANT UPDATE(price_minor) ON products TO palcare_guardian;
GRANT UPDATE(approved_at,approved_by) ON guardian_policies TO palcare_guardian;
GRANT UPDATE(used_at) ON operator_grants TO palcare_guardian;
GRANT SELECT,INSERT,UPDATE ON operator_sessions,guardian_cases,guardian_refunds,guardian_counters,guardian_checks TO palcare_guardian;
GRANT SELECT,INSERT ON guardian_prices,guardian_approvals,guardian_events TO palcare_guardian;
GRANT USAGE ON SEQUENCE guardian_prices_sequence_seq TO palcare_guardian;
-- No financial-write role may modify original checkout/Twin/receipt evidence or
-- create operator grants. Issuance/revocation is an operator CLI responsibility.
