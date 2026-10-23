-- Configure LOGIN/password privately only after separate credential authorization.
CREATE ROLE palcare_discovery NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO palcare_discovery;
GRANT SELECT,INSERT,UPDATE ON discovery_usage TO palcare_discovery;
GRANT SELECT,INSERT ON discovery_products TO palcare_discovery;
-- No purchase, Guardian, operator, policy or recall writes. Never use owner membership.
