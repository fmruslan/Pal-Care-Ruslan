# Stage 5 verification ledger

Baseline: `611e5d8`. Stage 5 implements the approved bounded security/cohesion fixes, without provider activation or application-database migrations.

## Completion labels

- **Implemented**: code/configuration exists.
- **Isolated verified**: dedicated local test database or fixture/browser evidence.
- **Actual environment verified**: separately inspected configured application login/configuration, not inferred from templates.
- **Blocked**: requires owner authorization, credentials, migration application or an external service.

## 5.1 — Database authority

Explicit writers never fall back to the reader URL. All CareOS database writes, including fixture mode, require a restricted login. Shared privilege checks inspect effective/login/assumable roles, dangerous attributes, protected-object ownership, schema creation, executable application SECURITY DEFINER functions, table and column writes and TRUNCATE. Per-capability permissions remain distinct. The web Blueprint no longer migrates/seeds or receives an owner-derived connection string. Migration CLI requires an explicit operator-only URL.

Runtime reader, checkout and existing service role templates are configuration preparation, not proof of actual credentials. `scripts/verify-runtime-authority.ts` is read-only and prints capability status only. Dedicated-test browser servers provision real disposable restricted logins, never narrowed-owner sessions.

Actual application credential changes/migrations remain **blocked pending separate owner authorization**. No existing purchase, receipt, policy, capture marker or financial key is changed.

Test results are recorded as execution completes below. No real PayPal/model/Channel3 calls or paid deployment are authorized.

5.1 isolated verification: lint, typecheck, build, format and **258 unit / 97 PostgreSQL tests** pass. Four focused database-backed browser checks pass under real disposable reader/CareOS/Guardian logins. Initial typecheck/mock failures were corrected before commit. Tests cover rejected column-only writes, TRUNCATE, assumable writer roles, ownership, narrowed-owner sessions and forbidden direct UPDATE. Existing application baseline hashes/counts for all 28 public tables were saved read-only outside Git for final comparison.
