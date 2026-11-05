-- Proposed only. A private operator sets the password out of band after approval.
-- Abort if this role name exists; never reuse or modify an existing credential.
CREATE ROLE palcare_demo_care_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS VALID UNTIL '2026-12-04T20:18:12.252Z';
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO palcare_demo_care_reader', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO palcare_demo_care_reader;
GRANT SELECT ON care_demo_packs,care_demo_evidence TO palcare_demo_care_reader;
