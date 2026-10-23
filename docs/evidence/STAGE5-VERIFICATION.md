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

Actual read-only authority verification returned **BLOCKED** for the configured application reader (existing excessive authority); scoped writers are **NOT CONFIGURED**. No role, password or environment value was changed to bypass this gate.

## 5.2 — Historical evidence

Reviewed additive migration 0013 adds UPDATE guards for original checkout intent, write-once provider IDs/attempt/completion evidence, Twins, documents and purchase events. Leases, error observations and legitimate first finalization remain mutable. No historical row is changed. Runtime roles lack DELETE/TRUNCATE/DDL authority; owner/superuser maintenance is not described as tamper-proof.

All **99 dedicated PostgreSQL tests pass**, including first finalization under an actual restricted checkout login, immutable-field rejection, document failure rollback/reconciliation, pending-to-completed transitions after expiry, and untouched original receipts. Expiry tests advance the clock instead of rewriting deadlines; storage-failure tests inject a storage failure instead of corrupting saved policies. Application migration is **not applied**, pending separate approval.

## 5.3 — CareOS correctness and failure isolation

Reviewed additive migration 0014 creates per-call reservations without backfilling/inventing historical usage. Calls settle independently, identical replay releases nothing twice, changed usage/bucket substitution fails, unknown calls remain reserved, original day buckets survive midnight, and an observed reservation overrun persists a budget block. Transcript clear/expiry cascades call rows but does not replenish budgets. Legacy unknown aggregate usage stays conservative. CareOS loads only intent-relevant auxiliary evidence; receipt lookup does not depend on recall/knowledge/Guardian availability.

**260 unit / 107 dedicated PostgreSQL tests pass**, including reverse-order known/unknown usage matrices, real restricted CareOS login, restart, concurrent replay, rollback after a missing bucket, UTC date boundary, cleanup and persistent overrun rejection. Two dependency regression tests prove receipt isolation and relevant-recall fail-closed behavior. No hosted inference is performed. Application migrations/configuration remain unapplied.
