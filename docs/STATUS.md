# Implementation status

Last updated: 2026-10-22

> **The approved Blue & Lavender frontend is preserved; Stage 2 payment verification is still incomplete.** The single authorized follow-up purchase was approved by the correct Personal Sandbox buyer. Orders v2 reports the order as `COMPLETED`, but its capture and the independent Payments v2 lookup both report **`PENDING`, reason `ECHECK`**. No completed payment or automatic Twin is claimed. The expiry fix and original-checkout local retirement are verified without recapture. Checkout defaults off and has no mock-provider mode. Supabase/customer login remain excluded.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Next.js 16 / React / TypeScript / Tailwind / shadcn-based UI | **Implemented** | Production build, lint and typecheck pass; premium responsive shell and original illustrations |
| Blue & Lavender identity and Purchase Twin passport | **Implemented** | Original interlocking mark, theme-aware product SVGs, passport frame, document divider and reusable semantic components across all existing screens; [design system and screenshots](DESIGN.md) |
| System / Light / Dark appearance | **Implemented** | System default, live OS changes, browser-local persisted overrides, hydration-safe selector, native/browser color synchronization and locally bundled Geist Sans; no checkout remount or financial requests on appearance change |
| Public customer and merchant dashboards | **Implemented** | Browsable without login; no mutation controls/endpoints |
| Purchase Vault and Twin detail pages | **Implemented; sandbox display independently tested** | Samples remain separate; new sandbox Twins use saved product/merchant snapshots and capture references |
| Documents and care history | **Implemented; sandbox persistence tested with provider double** | Original samples plus verified-capture receipt/policy/event path; no manufacturer manuals/warranties supplied |
| PostgreSQL / Drizzle migrations and seed | **Implemented; local PostgreSQL verified** | Eight tables; migrations 0001/0002 add checkout/rates and provenance; 0003/0004 add nullable observations and a separate observed capture identity, retaining the completed-payment FK boundary without changing keys/deadlines or seeding provider data |
| Read-only dashboards + bounded checkout | **Implemented; independent tests pass** | Separate write service, cookie authorization, exact Origin, bounded JSON, DB-backed quotas/leases/idempotency |
| Expired-checkout controls | **Implemented; local regression suite passes** | Derived expiry, redacted approval link, no automatic return capture on expired checkout, client-only deadline timer and preserved post-deadline reconciliation for attempted captures; no schema or design change |
| Existing-capture reconciliation | **Implemented; actual pending path verified** | Separate provider-read-only action, pinned capture ID, independent Orders/Payments retrieval, checked status and eCheck reason; failed/declined states create no Twin; completed evidence finalizes exactly once in domain tests, including after the original deadline |
| CI pipeline | **Configured; use commit-specific run evidence** | Commit-pinned Node 24 actions on Ubuntu 24.04 run quality checks, real PostgreSQL tests and both browser modes. See [latest runs](https://github.com/fmruslan/Pal-Care-Ruslan/actions) for the current commit; CI deliberately has no PayPal credentials and cannot prove actual Sandbox completion |
| Render deployment preparation | **Prepared, not deployed** | `render.yaml`, private-network DB, readiness, pre-deploy migration/seed and setup guide; account/billing approval needed |
| Supabase / customer login / private uploads | **Excluded by design** | Replaced by Render PostgreSQL and public fictional identities |
| Demo merchant catalog | **Implemented** | `/shop`, trusted allowlisted products and integer USD prices, clear disabled/configuration state |
| PayPal Sandbox create/approval/capture | **Actual approval verified; capture pending ECHECK** | Exactly one authorized follow-up checkout. Actual payer matches the previously independently user-checked Personal buyer and differs from merchant. Order is `COMPLETED`; Orders/Payments capture status is `PENDING / ECHECK`, not a verified completed payment |
| Automatic Purchase Twin generation | **Implemented and independently tested; LIVE VERIFICATION BLOCKED** | Retrieved Orders v2 + Payments v2 evidence must validate before atomic persistence; tests use an injected provider double, not actual PayPal |
| Webhooks | **Assessed, not implemented or verified** | [Render prerequisites, signature verification, inbox/deduplication, durable retries and actual-delivery acceptance plan](PAYPAL-WEBHOOKS.md); no listener or signature/delivery claim |
| Price Guardian and partial refund | Not started | Authorized merchant approval and verified PayPal refund |
| CPSC candidate matching | Not started | Real source data and model verification |
| Product Care assistant | Not started | Grounded answer from actual manual |
| Channel3 discovery | Not started | Live product results and retailer links |
| AG Studio intelligence | Not started | Real custom widget and agent interaction |
| Public deployment and demo | Not started | Accessible URL and public video |

## Local verification

- `pnpm install --frozen-lockfile`: reproducible installation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, repository validation and `git diff --check`: pass.
- Unit tests: **111 passed**, including 13 expiry assertions, 24 light/dark semantic contrast assertions, pending/terminal capture identity validation, observed/verified pinned-ID replacement rejection and reconciliation HTTP authorization/body tests. Unit-only provider payloads are not live proof.
- PostgreSQL integration: **43 passed** against a dedicated PostgreSQL 17 test database. **36 checkout cases use an injected PayPal double**, including pending/completed/failed/declined reconciliation after expiry, exactly-one Twin/receipt/policy/event, concurrent checks, provider timeouts, pinned-ID/amount mismatches, dual-source completion requirements, observation constraints and persistent quotas. A pending observed capture cannot satisfy the verified Twin's database foreign key. Seven foundation cases verify migration/seed/integrity. Test-origin sandbox rows are cleaned up and never seeded into the application database.
- Playwright: **234 passed in fixture mode + 234 passed in dedicated-test-database mode**, spanning six Chromium projects: desktop/tablet/mobile × light/dark. This includes seven-page axe WCAG A/AA scans, theme/hydration/storage/keyboard/reduced-motion/reflow checks, expiry, pending eCheck, completed/failed/declined reconciliation and returning-attempt routing. All 24 approved screenshot baselines compare without updates. Checkout outcome tests intercept HTTP responses and are explicitly labeled mock UI transport; they do not prove actual PayPal settlement.
- **24 fixture-only visual references** cover homepage, dashboard, Purchase Twin and shop across all six projects. Representative desktop/tablet/mobile screenshots were manually inspected in both themes. Screenshot baselines contain no private checkout or real customer data; see [visual references](DESIGN.md#visual-review-and-regression-references).
- Production-server failure test: **1 passed**, confirming an unavailable PostgreSQL database returns readiness 503 without a fixture fallback or DSN disclosure.
- Render Blueprint: validated against Render's official JSON schema; account-level/cloud deployment remains unverified.
- Stage 2 `pnpm audit --prod` was attempted, but the npm audit service timed out; no current audit result is claimed. Stage 1's earlier audit result is not evidence for newly added SDK dependencies.
- Automated accessibility checks are a baseline, not a full manual accessibility certification or security audit.

## Stage 2 readiness and prerequisites

The code path is **not yet complete**. An earlier `pnpm paypal:verify` run returned **BLOCKED (exit 2)** before credentials were configured. Later private operational checks verified Sandbox OAuth and actual order creation/retrieval, not capture. Hosted approval returned “This PayPal account is associated with the merchant you're trying to pay.” The root cause is unproven; the original local checkout subsequently expired without capture or Twin creation. The verification command only passes when direct PayPal retrieval and a matching durable Twin/receipt both validate.

The follow-up read-only recheck of the **original** provider order returned HTTP 404, not payment/cancellation proof. Its expired local checkout had no attempted-capture marker, capture reference, verification timestamps or Twin. It was safely cancelled locally using the existing service, retaining its evidence and keys with no provider mutation. Prior diagnostics remain private.

The user then confirmed the original Mac Chrome profile, exact localhost origin and previously independently login/profile-checked Personal Sandbox buyer, and created **exactly one** new USD 129.00 headphones checkout. Preapproval retrieval validated saved product/merchant/price/reference data and an unexpired deadline. The user approved on PayPal and returned in the same browser. The capture-attempt marker was persisted before the provider call.

At 2026-10-22 19:30 UTC, actual Orders v2 returned `COMPLETED` at the order level but one final USD 129.00 capture with `PENDING / ECHECK`. Independent Payments v2 retrieval confirmed that same capture ID, amount, currency, timestamp and pending reason. The returned payer ID matches the confirmed Personal buyer, not the Business payee. PostgreSQL correctly remains `pending`, without verified timestamps or a linked Twin. Reconciliation at 19:31 UTC used the normal service with provider create/capture methods explicitly forbidden: one provider retrieval, zero provider mutations, no recapture, and unchanged attempt marker, request keys and deadline. No raw provider bodies or payer identity were saved in Git.

At 20:47 UTC, reviewed migration 0003 was applied without seeding/resetting data; both existing checkouts' prior fields were unchanged. The new reconciliation-only service then retrieved Orders v2 and the same existing Payments v2 capture, with provider create/capture calls forbidden. Actual status was still `PENDING / ECHECK`; the capture identity/status/check time were persisted, all attempt markers/keys/deadlines retained, and no Twin created. Actual pending reconciliation is verified; completed/failed/declined and after-deadline transitions are regression-test evidence only, not invented live outcomes.

At 20:59 UTC, migration 0004 preserved the existing capture ID verbatim in a separate observed-identity field, reserving the original reference for completed-payment evidence and preserving the verified Twin FK boundary. Status, keys, markers, deadlines and Twins were unchanged. Actual reconciliation at **21:01 UTC** again used one Orders GET and one Payments GET with create/capture calls forbidden: still `PENDING / ECHECK`, zero provider mutations and zero Twins. The original deadline has not been extended; after-deadline safety is independently regression-tested.

Required next: await or investigate PayPal's pending eCheck for **this existing capture**. Do not create another order, resubmit capture, reset attempt markers or fabricate completion. Once the actual capture becomes `COMPLETED`, reconcile the existing checkout, retrieve both Orders/Payments evidence and verify atomic Twin/receipt/policy/event persistence. No settlement time is promised for Sandbox. The prior hosted approval rejection did not recur in this attempt; its original root cause is not established. Any authorized live verification still requires private Sandbox credentials, expected merchant ID, exact `APP_ORIGIN`, database mode and explicit enablement. See [docs/PAYPAL.md](PAYPAL.md). Render public deployment and actual HTTPS webhook delivery remain unverified.

## Redesign boundaries

The approved redesign changed presentation, appearance preference and tests, not financial behavior; it made no live provider calls. The subsequent Stage 2 expiry follow-up changes deadline projection/control eligibility only, retaining authorization, leases, budgets, request keys, attempted-capture markers and provider-evidence verification. Database schema/migrations, provider adapter and the visual design remain unchanged. Product Care, monitoring, refunds and sponsor integrations are still planned; polished cards do not indicate connected services. Successful approval of the follow-up order is not a claim that all buyer-approval issues are fixed.

The later capture-reconciliation slice adds reviewed migrations 0003/0004 and provider-status handling, without changing the approved visual design, merchant scope, first-capture authorization, financial request keys or deadline. New pending/failure copy and the explicit reconciliation control do not imply settlement or webhook support.

A feature is only marked complete after a reproducible test or actual external-provider evidence. Mock data and UI prototypes must remain identified as such.
