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

## 5.4 — Product-aware customer journey and detail access

Twin/document/case detail uses fixed-scope by-ID queries, independent of list windows. CareOS can include an older selected Twin without losing its bounded selection list. Safety/replacement links carry saved Twin identity or the separately allowlisted Insignia reference; categories are derived server-side, invalid/mixed contexts are rejected, and unsupported products never substitute headphones. Reference ownership has no fabricated Twin/receipt. Root CareOS stays available on both aftercare routes and registers explicit product/example context.

**263 unit / 108 PostgreSQL tests pass**, with a 105-newer-Twins regression proving older Twin and receipt access. Lint/typecheck/build/format pass. New complete customer and reference journeys pass **4 fixture + 4 database checks** on desktop-light/mobile-dark, with attached screenshots and zero financial browser POSTs. Four existing aftercare/accessibility checks also pass. An initial desktop test needed to close the intentionally persistent assistant dock before clicking the underlying page; no force-click workaround was used. Full matrices remain final-release gates.

5.1 exact-SHA CI passed: `ca7ab08571f41a41a2e524472750b792a21ef83d`, [run 39920872584](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39920872584). A watch request encountered a transient GitHub 502; direct run readback confirmed success.

## 5.5 — Analytics filter cohesion

The workspace owns the selected stage. Full bounded facts go into Studio; controls, scripted tools and status-widget actions update the same page filter via supported immutable SDK state APIs. Native independent stage cross-filters are replaced by the shared page selection so they cannot silently intersect. Widget-specific verified scope and unfiltered all-record totals remain explicitly distinct. Layout restoration preserves filter scope rather than hiding a reset; no new state-management library or runtime inference is added.

Lint/typecheck/unit/build pass; the original conflicting-script/outer-selector regression now passes under the actual SDK on desktop-light and mobile-dark. Tests select Pending through the scripted tool, then Approved externally and observe its $20 inside Studio, then reset to All. Full final matrices remain release gates. AG Studio local-evaluation licensing boundaries are unchanged.

## 5.6 — Unified activity and merchant continuity

One read-only activity projection combines purchase events, receipt references, Guardian state/history and saved recall assessments. Stable source IDs deduplicate entries; only independent completed refund evidence earns verified status; physical recall uncertainty stays explicit. Partial-source availability is disclosed. CareOS history/attention and Glance consume that projection; Twin and dashboard activity expose source links. No master writable ledger or financial backfill is created.

Merchant mobile navigation now uses merchant destinations. Operator mutations consume the saved projection response and refresh server-rendered state, retaining a disabled/busy boundary and never replaying a failed mutation. A regression asserts the approved (not refunded) state appears without manual reload.

Lint/typecheck/build, **267 unit tests**, **70/70 deterministic/fixture evaluations**, **18 focused fixture browser checks** and all **6 exclusive synthetic Guardian lifecycle checks** pass. The Guardian browser suite uses actual temporary restricted reader/operator logins and an injected provider, not PayPal. Screenshots are attached to the journey test reports. Intentional history-screen visual references will be reviewed in the final verification increment.

## 5.7 — Bounded ingestion and deployment readiness

Recall ingestion commits bounded, resumable batches of unassessed Twin/source/engine work (100 per batch, maximum 20 per invocation); later UUIDs behind an old cursor are not skipped. Output distinguishes remaining work from successful source retrieval. Private refresh requires its own verified recall writer before the official GET. Coverage remains one reviewed notice, not comprehensive monitoring.

Readiness validates exact APP_ORIGIN, enabled-feature configuration, required relations/positive permissions and active evidence guards, with a three-second response deadline and briefly cached metadata. Connectivity/required fictional identities are rechecked each request. There are no provider calls or write probes. Runtime readers share a maximum-three pool; each distinct writer uses maximum two connections. Credential boundaries are never merged. Owner/migration/bootstrap secrets are rejected in the web environment; PUBLIC TEMP and hidden private-table SELECT authority are checked alongside writes and assumable roles.

Additive migration 0015 additionally freezes established approval links and completed capture observations; it does not edit 0013 or any historical row. The migration rehearsal creates a separate disposable test database at migration 0012, seeds labeled samples plus injected completed/pending/cancelled purchases, compares **every row in all 28 original tables** around migrations through 0015 twice, and successfully reconciles the old pending test capture afterward.

**270 unit / 111 PostgreSQL tests**, lint/typecheck/build/format and the production database-outage test pass. Twelve focused database browser checks also passed before the final terminal-evidence follow-up; the full final suites will exercise the exact final state. Actual application migrations/credential provisioning remain **blocked**, not inferred from these tests. No real provider calls were made.

## 5.8 — Final integration checks, documentation and bounded polish

Current setup/API/architecture/product/security/judging/agent guidance now distinguishes implementation from actual environment gates. Private cleanup/catalog jobs also require their explicit capability, and private grant issuance uses an operator-only URL rejected by the web runtime. [ADR 0009](../adr/0009-stage5-hardening.md) records the approved boundaries. No model/library/framework migration or speculative scaling system was introduced.

Two final integration regressions were found and corrected before release:

1. A full positive reader preflight could reintroduce receipt dependence on unrelated auxiliary grants. A real restricted-login regression first failed, then passed after required reads became operation-specific; global forbidden-authority checks and full deployment readiness remain unchanged.
2. Visual review found that the fixture adapter had not honored new by-ID scoping, allowing unrelated sample activity on a Twin detail screen. Fixture and database detail semantics now match, the detail projection is defensively scoped, and unit/journey tests reject unrelated product activity.

The optional Studio semantic summary collapses into an accessible disclosure while the workbench is open, reducing duplicate mobile dashboards without hiding provenance/filter scope or vendor warnings. Firefox/WebKit essential-journey projects are added, with normal assertion deadlines and a 60-second multi-action test budget for axe/screenshots/SDK tools on Linux WebKit. Initial local WebKit launches were blocked by missing native libraries; official Ubuntu dependencies were extracted into user-local test/browser storage, without a system package install or modified browser executable. Cross-engine results are recorded below when complete, never called physical-device/Safari certification.

Read-only actual application comparison: **all rows/counts/hashes across all 28 existing public tables match the pre-Stage-5 baseline**. The configured actual login is still a superuser, scoped writers remain unconfigured, and no application migration was applied. This is preserved-data evidence and an explicit **BLOCKED actual-environment security gate**, not a least-privilege success claim.

Final release matrix and exact-SHA CI are recorded after completion. Current lint/typecheck/build/format, **271 unit / 111 PostgreSQL tests**, 70/70 fixture evaluations, outage checks, frozen install and production dependency audit pass. Existing viewport screenshot baselines were retained; full-page activity/journey screenshots are reviewed separately. No fresh PayPal/model/Channel3/CPSC request, actual application credential change, license activation, cloud deployment or financial mutation occurred.

Final test-harness hygiene check found Playwright's default force-kill could bypass asynchronous test-login cleanup. The wrapper now receives SIGTERM with a ten-second grace period; an automated failure-suite regression proves all six created actual logins disappear on shutdown. Forty-eight earlier wrapper-created orphan test logins were inspected (no owned objects, no foreign-database dependencies, no active sessions) and narrowly removed from the dedicated test scope. No application role/password or application record was changed. Browser children also explicitly discard real provider credentials/reserved experiment values, independent of activation flags.

## Final isolated release results

| Check | Before Stage 5 | Final local result |
| --- | --- | --- |
| Unit tests | 257 | **271 passed** |
| Dedicated PostgreSQL | 96 | **111 passed** |
| Fixture Chromium matrix | 330 | **348 passed** |
| Database Chromium matrix | 330 | **348 passed** |
| Exclusive synthetic Guardian lifecycle | 6 | **6 passed** |
| Firefox/WebKit essential journeys | Not established | **8 passed** (4 Firefox desktop, 4 WebKit emulated mobile) |
| Outage / cleanup | 1 outage | **2 passed** |
| Versioned deterministic/fixture evaluations | 70/70 | **70/70 passed**, zero model/financial calls |
| Lint, typecheck, production build, formatting | Passed | **Passed** |
| Frozen installation / production audit | Passed | **Passed; no known vulnerabilities reported** |

The normal browser count is 58 scenarios repeated across six Chromium viewport/theme projects per data mode, not 348 independent features. Cross-engine checks are focused, patched Playwright browsers on Linux, not actual devices or branded Safari. Existing screenshot comparisons pass without baseline changes. Full-page desktop/mobile light/dark screenshots, journey attachments and HTML/trace evidence are under `test-results/` and `playwright-report/`; CI uploads these as `browser-results`. Manual review confirmed scoped Twin activity, preserved Blue/Lavender surfaces, readable provenance and the reduced duplicate Studio layout.

Configured database/PayPal client ID/secret were absent from built client assets. Model/Channel3 keys were unconfigured and are not claimed scanned. Local Markdown targets and repository/diff checks pass; external links and full accessibility/penetration/load certification are not claimed.

## Exact-commit CI and delivery

All seven implementation increments have successful exact-SHA Actions readbacks:

| Increment | Commit | Successful run |
| --- | --- | --- |
| 5.1 | `ca7ab08571f41a41a2e524472750b792a21ef83d` | [39920872584](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39920872584) |
| 5.2 | `7c04fefcd649c1f19d26d457f224b3179d9a1aac` | [39921340341](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39921340341) |
| 5.3 | `87db595403617e6aec30b45d8a695bd8b7034996` | [39922020876](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39922020876) |
| 5.4 | `1e3b9dd41fb25a1d5f55b82c4659171e867230dc` | [39923053381](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39923053381) |
| 5.5 | `e07b9f987ebce03f9ff5d166780f7118aef3b270` | [39924063690](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39924063690) |
| 5.6 | `0e0c9e96ba3455cbe36d7a6de13adb4030a65481` | [39925658817](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39925658817) |
| 5.7 | `ea2b04c129d3a7f0735c65b1bc947cc609cb56b6` | [39928031997](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39928031997) |

The final verification/documentation increment also runs the complete workflow, including new cross-engine and cleanup checks. Its exact SHA/run URL are read back after pushing and included in the delivery response (a commit cannot contain its own final SHA). [Current Actions](https://github.com/fmruslan/Pal-Care-Ruslan/actions).

## Remaining external gates — intentionally not closed

1. Separately authorize/apply migrations through 0015 with writers stopped and preservation verification. Provision actual restricted reader/writers, remove privileged secrets from the web execution/filesystem boundary, and verify actual logins/readiness. **Current reader remains a superuser; writers are unconfigured.**
2. Approve and verify genuine CareOS runtime inference with the fixed model/endpoint, provider spend limits and semantic grounding evaluations. Scripted/fixture checks are not live AI.
3. Separately authorize the exact eligible future Sandbox purchase/refund/recovery acceptance; preserve the legacy completed purchase and original pending eCheck. No new financial approval is inferred.
4. Obtain appropriate public AG Studio AI-feature license coverage through December 15 and wire/verify public access. Local watermark-preserving evaluation is not public licensing.
5. Verify actual Channel3 API/key/free credits if pursuing that sponsor claim; otherwise keep fixture labeling and omit qualification claims.
6. Approve hosting costs, deploy with exact HTTPS origin/scoped credentials, verify judge access/availability, and record the under-three-minute public video. Webhooks, real-device/manual accessibility, independent penetration and true load tests remain separate.

The large optional Studio vendor bundle remains lazy and isolated from customer routes; no unproven bundle/framework optimization or comprehensive recall expansion delays these gates. Stage 5 stops at the bounded fixes and verified existing journeys.
