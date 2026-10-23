-- Private operator-reviewed grants; no password/account activation here.
CREATE ROLE palcare_checkout NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO palcare_checkout;
GRANT SELECT ON products,merchants,checkout_orders,checkout_rate_limits,purchase_twins,guardian_policies,guardian_bindings TO palcare_checkout;
GRANT INSERT,UPDATE ON checkout_orders,checkout_rate_limits TO palcare_checkout;
GRANT INSERT ON purchase_twins,documents,care_events,guardian_bindings TO palcare_checkout;
