# Database recovery acceptance and Phase B checklist

Updated: 2026-10-26. **Phase A accepted; Phase B separately approved and completed for private local use.** [Actual cutover evidence](evidence/PHASEB-CUTOVER.md). Public OS isolation/provider activation/deployment remain blocked and unauthorized.

## Phase A acceptance

Recovery package: `phase-a-20261023T165349Z-8edbfd`. The GreatBison package and its checksummed contents remain unchanged. Later acceptance is recorded separately, not by rewriting the historical package.

| Gate | Result and evidence boundary |
| --- | --- |
| Encrypted local backup | Passed: application archive, globals, source manifest and operator recovery configuration; private permissions and SHA-256 verification |
| Actual isolated recovery | Passed in a separate PostgreSQL 17.10 container/new volume, no network/ports/original volume access; explicit scratch database, no `--create`/`--clean` |
| Restored state | All 28 application table fingerprints, migration journal, both sequences, owners/grants and role/verifier hashes matched. Schema matched after PostgreSQL reparsed 39 original CHECK expressions on empty scratch-only clones |
| Scratch migration | 0013–0015 passed; original application rows preserved; second run idempotent; eight rejected evidence mutations and one successful operational-lease probe, all rolled back |
| Scratch restricted accounts | Genuine SCRAM logins, incorrect password rejected; application authority/evidence checks, 21 table reads, 12 rollback-only CareOS CRUD probes and 26 rejected-authority probes passed |
| Final original comparison | Original schema/rows/roles/grants/sequences/migrations unchanged; runtime configuration byte-identical; scratch container/volume removed |
| Mac off-server copy | **Owner-confirmed verified on 2026-10-26:** encrypted package checksums and separate recovery-key comparison passed. Owner-run Mac evidence, not direct agent execution on Mac |
| Independent key custody | Owner confirmed a separate Mac recovery-key copy; key is not solely on GreatBison or inside the package. No key/password/verifier contents published |

Original `SHA256SUMS` digest: `6e60e7e80fcf40860e70934be5aea3c1d82e80370a1aeea1ceb8ffed703ffb77`. The package's original reports retain their then-pending off-server flags; this acceptance supersedes those flags only. macOS GnuPG decryption was not separately reported; decryption/restoration was tested on GreatBison and the Mac key copy was compared with that tested key.

Historical Phase A inspection: **0012 / 28 application tables**, superuser runtime login and original checkout-enabled flag. Phase B subsequently applied 0013–0015 and switched the actual private runtime to restricted reader/CareOS connections, with checkout and all provider flags disabled. Historical records are unchanged; one new fixture-verification conversation/two turns/rate buckets were retained. Recovery acceptance alone was not used as proof of this later cutover.

## Approved Phase B scope — completed checklist

One private local slice: apply 0013–0015, provision only reader/CareOS logins, separate runtime/operator credentials, verify actual application readiness. Preserve all original purchases, documents, policy snapshots, pending/cancelled checkouts, provider identities, keys, deadlines, attempt markers, usage reservations and history.

Excluded: **all PayPal calls** (including reconciliation/verifiers), paid AI, purchases/refunds, catalog/policy changes, ingestion/cleanup jobs, additional capability provisioning, owner password rotation/demotion, ownership reassignment, deployment and public exposure.

### 1. Authorization, target and recovery freshness

- [x] Obtain explicit Phase B approval; Phase A/documentation approval is insufficient.
- [x] Verify original `palcare` on GreatBison loopback port 55432 by container, volume and PostgreSQL system identifier. Exclude the other project, test databases and `postgres`.
- [x] Recheck local package checksums and separate key availability without exposing contents; retain GreatBison/Mac originals unchanged.
- [x] Read-only compare rows/schema/owners/grants/roles/memberships/sequences/migration hashes with Phase A. No drift; 13 records through 0012, only 0013–0015 pending. Future drift requires a reviewed recovery plan, not automatic backup overwrite.
- [x] Verify writers quiescent: no running web/jobs/application clients, prepared transactions, active checkout leases or lock blockers. No unrelated process/session killed or evidence reset. Private baseline and capacity/bounded waits verified.

### 2. Versioned migrations and preservation

- [x] Use a separate private operator context with explicit `MIGRATION_DATABASE_URL`; no web migration or general/owner fallback.
- [x] Review unchanged SQL/hashes for 0013 historical guards, 0014 per-call reservations and 0015 terminal evidence. No seed, schema-push, regenerated migration, reset or historical backfill.
- [x] After approval, run `scripts/verify-stage5-upgrade.ts --apply` with required `STAGE5_MIGRATION_APPROVED=true` and bounded lock waits in the operator context, plus broader preservation checks.
- [x] Verify all 28 original public-table fingerprints unchanged at migration time; 16 matching records through 0015; one new empty `care_model_calls` table (29 application tables).
- [x] Guardian sequence unchanged; Drizzle advanced exactly three entries. New-object owners/grants, enabled `assertEvidenceGuards` and reservation constraints/FK verified without mutating historical records.
- [x] Repeated invocation: no row/schema/journal/sequence changes; no unexpected SQL/lock/preservation result.

### 3. Restricted account provisioning

- [x] Review `scripts/reader-role.sql`, `scripts/careos-role.sql` and `src/db/authority.ts` against actual grants; templates alone are not acceptance.
- [x] Generate independent LOGIN credentials privately, outside Git/chat/logs/shell command arguments. Existing administrator retained for maintenance, no rotation/demotion/ownership transfer.
- [x] Reader: required public read projections only. CareOS: SELECT/INSERT/UPDATE/DELETE only on its four tables; no commerce, knowledge, Guardian or migration authority.
- [x] No runtime ownership/dangerous attributes, grant/admin options or unsafe memberships. Actual capability membership `INHERIT TRUE, SET FALSE`; `NOINHERIT` alone not relied on.
- [x] PUBLIC CONNECT/TEMP, schema CREATE, default ACLs, table/column/sequence/function grants and SECURITY DEFINER inspected. Privilege changes limited to target database/schema, required CONNECT/USAGE/reads/CRUD explicitly granted.
- [x] Safe role names/memberships, no globals replay or other-database ACL change. Checkout/Guardian/discovery/recall unconfigured.

### 4. Actual restricted-login acceptance

- [x] Genuine LOGIN authentication over runtime TCP path; identities/database/SCRAM and two incorrect-password rejections verified.
- [x] Read-only runtime authority CLI: explicit reader **and** CareOS PASS; disabled capabilities NOT CONFIGURED, not counted as acceptance.
- [x] Evidence guards, 21 required table reads, ownership/attributes/memberships/PUBLIC TEMP/table/column grants verified.
- [x] 26 forbidden-authority probes rejected with actual permission errors, normal sessions; historical rows not mutated.
- [x] 12 CareOS CRUD probes on new transaction-local records, rolled back; no historical cleanup/budget release. Original rows/sequences rechecked.

### 5. Private runtime switch and application verification

- [x] Operator/bootstrap/provider secrets moved to private files outside project/runtime configuration; old sensitive-value scan of application tree found no matches. Same-user OS reachability limitation remains explicit below.
- [x] Restricted reader/CareOS URLs only; no fallback or archived operator configuration restored to web runtime. Running process inspected.
- [x] All checkout/Guardian/paid/refresh flags false; CareOS/discovery fixture; live provider keys absent. Legacy checkout-enabled flag not copied forward.
- [x] Exact local origin retained; actual production server bound to `127.0.0.1:3000`; no public web/database ports.
- [x] Actual `/api/ready` 200, database source, required schema/capability/evidence checks passed; no provider calls.
- [x] Dashboards, five Twins, all six byte-identical downloads, Sandbox receipt/CareOS UI and disabled Buy controls verified. Original pending/cancelled/payment state preserved by fingerprints; no return actions/provider verifiers.
- [x] 111 dedicated PostgreSQL regressions and separate production outage check passed with no fallback/disclosure; explicit `TEST_DATABASE_URL` never targeted application/other project. Unit authority/readiness regressions also pass.
- [x] [Final actual evidence](evidence/PHASEB-CUTOVER.md) distinguishes local runtime verification, retained new CareOS verification records, isolated regressions and external blockers.

Same-user private local development does **not** establish OS isolation: the Docker-capable user can reach administrator files/container access. Before public exposure, separately verify an unprivileged runtime identity with no Docker/sudo or readable operator/recovery secrets. Do not bypass this boundary with Docker. OS-account restructuring/deployment is not a prerequisite for this private local slice.

## Failure and recovery

On drift, mismatch, unexpected authority, failed migration/readiness: keep providers off, retain private evidence and stop for review. No resets, original-database overwrite, down-migrations, weakened guards, owner web-login fallback or financial retries. A committed additive migration may remain applied while the app stays stopped; report that partial state honestly.

Restoration needs separate owner approval: restore into another isolated instance first and agree the recovery point before any original replacement. Phase A did not establish WAL archiving/PITR; database restore cannot reverse independent PayPal changes.

Report **implemented**, **isolated verified**, **actual application verified** and **externally blocked** separately. Passing Phase B would not authorize AI, payments, sponsor activation or deployment.
