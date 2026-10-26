# Phase B — actual local database security cutover

Date: 2026-10-26. Run: `phase-b-20261026T231442Z-39648b`.

**Approved and completed for the existing private local application.** Actual database/runtime verification, not inferred from templates or CI. Public deployment, OS runtime isolation and provider activation remain separate gates.

## Recovery and preflight

- Used the validated Phase A package; no replacement dump/reset/restore over the original. Package checksums remained unchanged. Owner-confirmed Mac integrity and independent key custody are recorded in [recovery acceptance](../DATABASE-CUTOVER.md).
- Reverified original container/image/volume, PostgreSQL system identifier and exact `palcare` database on loopback port 55432. All 28 public tables, journal, schema, both sequences, roles/grants and configuration matched Phase A before mutation.
- Only 0013–0015 pending; migration files matched repository HEAD. No application listener, other application client, prepared transaction, active checkout lease or blocked lock existed. Writers were already quiescent; no unrelated process/session was killed.
- Private pre/post manifests, separate operator migration context and bounded lock waits. Secrets, raw manifests and operational scripts remain outside Git.

## Actual migration and accounts

| Acceptance | Result |
| --- | --- |
| Only 0013–0015 applied | 16 matching migration records; 29 application tables |
| Original rows at migration time | All 28 original public-table counts/hashes identical |
| Sequences | Guardian unchanged; Drizzle advanced exactly three entries |
| New table/guards | Empty `care_model_calls`, validated constraints/FK, expected owners and enabled evidence guards |
| Repeated migration | No row/schema/journal/sequence changes |
| Genuine logins | `palcare_web_reader` and `palcare_web_careos` actually authenticated to `palcare`, not administrator `SET ROLE` |
| Authentication | Both incorrect passwords rejected on real SCRAM TCP path |
| Required authority | Application authority/evidence checks and 21 required table reads passed |
| Forbidden authority | 26 rejections: financial/knowledge writes, migration reads, TRUNCATE, DDL, temporary tables and role escalation; actual `42501` errors, not forced-read-only failures |
| CareOS CRUD | 12 new-record INSERT/UPDATE/DELETE probes across four tables, all rolled back |

Only two non-login capability groups and two independent restricted logins were provisioned. Membership: `INHERIT TRUE, SET FALSE`, no admin option. Checks cover login/effective/assumable identities, dangerous attributes, ownership, table/column grants, PUBLIC TEMP, positive permissions and SECURITY DEFINER exposure. No runtime ownership, administrator escalation or commerce-write authority.

PUBLIC database access/TEMP restricted on **`palcare` only**, required CONNECT granted explicitly; inappropriate PUBLIC schema CREATE revoked. Default ACLs and role settings inspected (none). No globals replayed. Other database catalog ACLs unchanged; other project's container/database untouched. Original administrator credentials/attributes and object ownership unchanged for private maintenance.

## Actual runtime and application

- Owner/bootstrap/provider recovery configuration retained in private `0700` operator storage with `0600` files outside the project. `.env.local` has restricted runtime connections, no owner/migration/operator/test-database/provider credentials.
- Production build started at **`127.0.0.1:3000`**, exact `APP_ORIGIN=http://localhost:3000` retained for tunnel/browser access. Sanitized explicit process environment; `/proc` inspection confirmed restricted URLs and absent administrator/provider credentials. PostgreSQL independently showed only reader/CareOS application sessions.
- Runtime-authority CLI: reader/CareOS PASS; checkout/Guardian/discovery/recall NOT CONFIGURED. Both required capabilities explicitly checked.
- `/api/ready`: HTTP 200, `source: database`, CareOS `fixture`, checkout/Guardian `disabled`, discovery `fixture`.
- Actual Chromium: 10 page navigations, all five Twins rendered, all six document downloads byte-identical, completed Sandbox receipt opened through deterministic CareOS, disabled Buy controls.
- Raspberry Pi care answer used explicit fixture provider with official-source attribution. History survived reload; identical replay returned the saved result; another browser context could not read it.
- **Zero financial browser POSTs/external browser requests**. Live credentials absent; model/provider-call/spending records zero; all financial/paid/refresh flags false. No PayPal verifier/reconciliation invoked.

Verification retained **one new CareOS conversation, two turns and ordinary rate-limit buckets**. Nothing deleted to force unchanged counts. Three previously empty CareOS tables gained only this verification data; `care_model_calls` remains empty. All **25 other original public tables** remain byte-identical, and every original historical row is preserved. Sequences stable after expected migration advance.

Final counts: three checkouts (completed/pending/cancelled), four sample Twins plus one Sandbox Twin, six documents, zero Guardian cases/refunds. Zero document/payment/policy integrity mismatches. Provider IDs, attempt markers, keys, deadlines, receipts and policy snapshots unchanged; no fresh PayPal-side settlement claim.

## Local regression results

| Check | Result |
| --- | --- |
| Lint / typecheck / production build / format | Passed |
| Unit | 271 passed |
| Dedicated PostgreSQL integration | 111 passed, none failed/skipped; explicit `TEST_DATABASE_URL` to `palcare_stage2_test`, never application/other project |
| Deterministic/fixture evaluation | 70/70, no model/financial calls |
| Separate production outage test | Sanitized readiness/CareOS 503, no fallback/disclosure |
| Repository checks | Passed |
| Final preservation after integration tests | Passed; original data/roles/grants/sequences retained as above |

No tracked application code or migration changed. Actual-app probes are private operational acceptance, not synthetic commerce seeds. Full browser/synthetic Guardian/cross-engine suites run in GitHub Actions against its dedicated service database; exact commit/run result is reported after push. CI does not verify GreatBison or live providers.

## Remaining limitations

1. **OS runtime isolation not established:** same Docker-capable Linux account. Sanitized environment/files do not prevent that identity reading operator files or using Docker for administrator access. Separate unprivileged runtime identity, no Docker/sudo/operator/recovery-file access, must be provisioned/verified before public exposure. No privileged host workaround used.
2. Local process is not a supervised/deployed public service. No restart guarantee, public URL, TLS/webhook delivery or cloud provisioning claimed.
3. Hosted CareOS inference, actual Sandbox refund/recovery, public AG Studio licensing/access, actual Channel3, webhooks and deployment remain separately approved tasks. Financial/provider activation stays off.
4. Recovery is a tested logical backup, not PITR. Phase A package was not overwritten to include the cutover; private cutover evidence is separate. Future restore/recovery-point policy needs review; never restore old owner secrets/financial flags into web runtime.

See [completed checklist](../DATABASE-CUTOVER.md), [setup](../SETUP.md), [security](../SECURITY.md) and [status](../STATUS.md).
