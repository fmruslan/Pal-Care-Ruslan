# Ten-product Care — exact new persistence approval

**Owner approved after remaining gates; not applied.** The owner explicitly selected **Approve after gates** for the exact SQL/data/grant/operator identities below, six purchases, 16 documents, two evidence tables and one restricted reader. This does not waive CI, preservation, actual-permission or verified-rollback gates. This packet is separate from the already activated Care/protection permissions. Current application evidence remains in [STATUS](STATUS.md).

## Requested scope

After relevant tests, all three exact-commit CI jobs, preservation preflight and verified application-only rollback gates:

1. Apply only [0019_ten_product_demo.sql](../drizzle/demo-care/0019_ten_product_demo.sql), using the selected standard Drizzle lane `drizzle/demo-care` and `drizzle.__care_demo_migrations`. Root 0016 and existing journals/SQL remain unchanged.
2. Run the manifest-bounded insert-only data migration: **6 products + 6 sample Twins + 16 sample documents + 1 pack + 20 evidence rows**. Evidence comprises ten simulated Care examples and ten independently dated real retail references. It creates no PayPal order/capture/receipt or verified eligibility.
3. Provision **one new independent restricted reader login**, no writer/worker: [exact role/grant template](proposals/ten-product-reader.sql). New role name must be unused. Generate its password privately, never in Git or logs. No old role/password/membership/grant changes. Verify effective/login/assumable roles, table/column access, object ownership, PUBLIC TEMP and positive required reads with the actual login.
4. Only after those gates, enable `CARE_DEMO_ENABLED=true` with `CARE_DEMO_READER_DATABASE_URL` in the private web allowlist, then deploy the exact CI-green application to existing **8444 → 3002** and HTTPS-smoke it. No public writer or external feed is enabled.

## Review identities

- Schema SQL SHA-256: **`59fa5bdff64b2ee2aab42c368347a46d0a795d001e74fb7dfb260b0fc2f38d60`**.
- Canonical data-manifest SHA-256: **`8547872fb79656e88885dac0e35493687cb0ef6e5b2f4aaf06dc2807c9203782`**.
- Grant-template SHA-256: **`f86ef4556e158cd85849a5936d42156483c086003f4756bf4b17a4b5f3ba61be`**.
- Private operator SHA-256: **`1585931152fd45febda33a8074000f928b355ea37db4c49dbdff26cd96f9afbf`**; insert-helper SHA-256: **`45ea9448af50ee6c06cc679b366da18e5cf6b9e321ba592c1902f587a32dc0f1`**. `pnpm exec tsx scripts/migrate-demo-care.ts --print-proposal` prints these hashes and row counts without contacting a database. Invocation flags or hash environment variables are safeguards, not owner consent.
- Pack ID: `00000000-0000-4000-8000-000000000900`, version `care-ten-v1`.
- Disclosed simulation date: **2026-11-05T12:00:00.000Z**. This does not change actual clocks, source-check dates, authorization or worker expiry.
- Credential expiry: **2026-12-04T20:18:12.252Z**; no automatic extension for judging. This does not establish access through December 15.

## Added sample rows

| Product | Product ID suffix | Twin ID suffix | Fictional saved amount |
| --- | --- | --- | --- |
| Refrigerator · Whirlpool WRT311FZDW, white | 105 | 205 | USD 1,199.00 |
| Leather boots · Timberland TB110061713, Wheat | 106 | 206 | USD 199.00 |
| Mattress · Zinus WMGTE-12Q, Queen 12-inch | 107 | 207 | USD 269.00 |
| Hardcover book · fictional Pal Press Design Notes HC-01 | 108 | 208 | USD 24.95 |
| iPhone 16 · 128GB Ultramarine, carrier later | 109 | 209 | USD 879.00 |
| Tears of the Kingdom · Switch physical new | 110 | 210 | USD 64.99 |

All IDs above use prefix `00000000-0000-4000-8000-000000000`. Six receipt IDs end 305–310; ten scenario evidence-document IDs end 501–510; twenty structured evidence IDs are declared in `src/lib/care/demo/catalog.ts`. Existing source rows are not updated, deleted, retitled or relabeled.

The Pi retains its original unavailable purchase amount; its explicitly hypothetical USD 189.00 price example is saved separately, excluded from spending. Original sample and verified Sandbox headphones remain separate dated Twins under one product card. Starting from the recorded five application Twins, the data migration yields **eleven purchase records / ten products**. A separately authorized later genuine purchase would add another Twin, not overwrite a sample.

## Transaction, permission and rollback behavior

- Standard Drizzle applies the additive schema transaction first. The data insertion is a separate locked transaction: an ID/content conflict aborts **all data insertions**, never updates the conflicting record. If seed insertion fails, the additive empty schema/journal may remain; retry with the same reviewed manifest is safe. Do not claim whole-schema-plus-seed atomicity.
- Schema adds two tables, one invoker-only integrity function and two append-only/binding triggers. No existing table definition or grant changes. The reader can SELECT only the new fixed-scope tables, not checkout, financial, conversation or base purchase tables. Web record reads retain the existing restricted reader independently.
- Canonical JSON hashing tolerates PostgreSQL JSONB key ordering. Runtime requires the exact versioned release manifest; absent/altered evidence fails visibly, never falls back to fixtures. Existing workers may discover new samples under their existing bounds and record unsupported policies; simulation cannot enable those workflows.
- Before activation, preserve original-row fingerprints, original logins/credentials/memberships, root journal, protected policy/usage/unknowns and runtime settings. Isolate legitimately changing operational/AI ledgers instead of freezing them. Verify original application startup/readiness and HTTPS **after** additive schema/data, before promotion.
- On critical regression, disable only this new capability and restore verified application assets/configuration. Retain all original/new evidence and current credentials/accounting. No destructive DOWN, database snapshot restore, policy rewrite or allowance reset.

## Explicitly excluded

No new worker/timer, general research connector, carrier integration, live retail scraping, recall ingestion, account/billing/license activation, refund/adjustment, production money, additional AI allowance or public exposure. A new PayPal Sandbox create/capture needs its [own exact approval](PAYPAL-TEN-PRODUCT-SHOWCASE-APPROVAL.md); this migration cannot grant it. Old exact approvals are unchanged.

**Owner decision recorded:** **Approve after gates** for this exact additive schema/data scope and one restricted reader. Any change to SQL, canonical manifest, grants or scope requires refreshed hashes before activation.
