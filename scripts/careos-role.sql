-- Operator-reviewed grants. Create login/password separately using your database
-- provider's secure console; never put a password or DSN in this file or Git.
-- Role must not inherit membership in another writer/owner role.
CREATE ROLE palcare_careos NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO palcare_careos;
GRANT SELECT, INSERT, UPDATE, DELETE ON care_conversations, care_requests, care_buckets, care_model_calls TO palcare_careos;
-- No grants on commerce or knowledge tables. Runtime live reservation also
-- rejects a role with any INSERT/UPDATE/DELETE authority on those tables.
