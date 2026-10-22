# Implementation status

Last updated: 2026-10-22

> **The premium Blue & Lavender frontend is implemented; Stage 2 payment verification is still incomplete.** Operational testing confirmed actual Sandbox authentication and order creation/retrieval, but hosted buyer approval was rejected. No actual capture, end-to-end automatic Twin creation or webhook delivery is verified. Checkout defaults off and has no mock-provider mode. The approval issue and known checkout-expiry defect are separate, unchanged work items. Supabase/customer login remain excluded.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Next.js 16 / React / TypeScript / Tailwind / shadcn-based UI | **Implemented** | Production build, lint and typecheck pass; premium responsive shell and original illustrations |
| Blue & Lavender identity and Purchase Twin passport | **Implemented** | Original interlocking mark, theme-aware product SVGs, passport frame, document divider and reusable semantic components across all existing screens; [design system and screenshots](DESIGN.md) |
| System / Light / Dark appearance | **Implemented** | System default, live OS changes, browser-local persisted overrides, hydration-safe selector, native/browser color synchronization and locally bundled Geist Sans; no checkout remount or financial requests on appearance change |
| Public customer and merchant dashboards | **Implemented** | Browsable without login; no mutation controls/endpoints |
| Purchase Vault and Twin detail pages | **Implemented; sandbox display independently tested** | Samples remain separate; new sandbox Twins use saved product/merchant snapshots and capture references |
| Documents and care history | **Implemented; sandbox persistence tested with provider double** | Original samples plus verified-capture receipt/policy/event path; no manufacturer manuals/warranties supplied |
| PostgreSQL / Drizzle migrations and seed | **Implemented; local PostgreSQL verified** | Eight tables; migrations 0001/0002 add checkout/rates, provider references, constrained provenance and globally unique client request IDs |
| Read-only dashboards + bounded checkout | **Implemented; independent tests pass** | Separate write service, cookie authorization, exact Origin, bounded JSON, DB-backed quotas/leases/idempotency |
| CI pipeline | **Configured; use commit-specific run evidence** | Commit-pinned Node 24 actions on Ubuntu 24.04 run quality checks, real PostgreSQL tests and both browser modes. See [latest runs](https://github.com/fmruslan/Pal-Care-Ruslan/actions) for the current commit; CI deliberately has no PayPal credentials and cannot prove actual Sandbox completion |
| Render deployment preparation | **Prepared, not deployed** | `render.yaml`, private-network DB, readiness, pre-deploy migration/seed and setup guide; account/billing approval needed |
| Supabase / customer login / private uploads | **Excluded by design** | Replaced by Render PostgreSQL and public fictional identities |
| Demo merchant catalog | **Implemented** | `/shop`, trusted allowlisted products and integer USD prices, clear disabled/configuration state |
| PayPal Sandbox create/approval/capture | **Implemented; partial operational verification only** | Actual OAuth and order creation/retrieval succeeded. Hosted buyer approval rejected; root cause not established. No actual capture verified |
| Automatic Purchase Twin generation | **Implemented and independently tested; LIVE VERIFICATION BLOCKED** | Retrieved Orders v2 + Payments v2 evidence must validate before atomic persistence; tests use an injected provider double, not actual PayPal |
| Webhooks | Not implemented or verified | Direct provider retrieval is used; actual HTTPS delivery/signature/replay testing deferred |
| Price Guardian and partial refund | Not started | Authorized merchant approval and verified PayPal refund |
| CPSC candidate matching | Not started | Real source data and model verification |
| Product Care assistant | Not started | Grounded answer from actual manual |
| Channel3 discovery | Not started | Live product results and retailer links |
| AG Studio intelligence | Not started | Real custom widget and agent interaction |
| Public deployment and demo | Not started | Accessible URL and public video |

## Local verification

- `pnpm install --frozen-lockfile`: reproducible installation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, repository validation and `git diff --check`: pass.
- Unit tests: **77 passed**, including 24 new light/dark semantic contrast assertions plus configuration, order/capture evidence, currency/amount/item/payee checks, authorization/body boundaries, sample integrity, snapshots and UI helpers. Unit-only provider payloads are not live proof.
- PostgreSQL integration: **26 passed** against a dedicated PostgreSQL 17 test database. **19 checkout cases use an injected PayPal double** to exercise atomic persistence/rollback, cancellation, declines, pending/ambiguous responses, concurrent/repeated attempts, lost initial cookies, saved product snapshots, ownership, expiry and quotas. Seven foundation tests verify migration/seed/integrity behavior. Test-origin sandbox rows are cleaned up and never seeded into the app database.
- Playwright: **174 passed in fixture mode + 174 passed in dedicated-test-database mode**, spanning six Chromium projects: desktop/tablet/mobile × light/dark. This includes seven-page axe WCAG A/AA scans, theme preference and OS-change behavior, hydration, storage failure, keyboard/reduced-motion/reflow checks, shop disabled-state and forged-return checks. Checkout success/cancel/failure and appearance-invariance tests intercept HTTP responses and are explicitly labeled mock UI transport; they do not prove an actual PayPal purchase. An earlier database run was invalidated by a concurrent rebuild and interrupted; the clean rerun passed all 174 cases without updating baselines.
- **24 fixture-only visual references** cover homepage, dashboard, Purchase Twin and shop across all six projects. Representative desktop/tablet/mobile screenshots were manually inspected in both themes. Screenshot baselines contain no private checkout or real customer data; see [visual references](DESIGN.md#visual-review-and-regression-references).
- Production-server failure test: **1 passed**, confirming an unavailable PostgreSQL database returns readiness 503 without a fixture fallback or DSN disclosure.
- Render Blueprint: validated against Render's official JSON schema; account-level/cloud deployment remains unverified.
- Stage 2 `pnpm audit --prod` was attempted, but the npm audit service timed out; no current audit result is claimed. Stage 1's earlier audit result is not evidence for newly added SDK dependencies.
- Automated accessibility checks are a baseline, not a full manual accessibility certification or security audit.

## Stage 2 readiness and prerequisites

The code path is **not yet complete**. An earlier `pnpm paypal:verify` run returned **BLOCKED (exit 2)** before credentials were configured. Later private operational checks verified Sandbox OAuth and actual order creation/retrieval, not capture. Hosted approval returned “This PayPal account is associated with the merchant you're trying to pay.” The root cause is unproven; the original local checkout subsequently expired without capture or Twin creation. The verification command only passes when direct PayPal retrieval and a matching durable Twin/receipt both validate.

Required next: diagnose the buyer-approval rejection in a separate operational task and address expired-checkout controls in a separate tested code change. Any authorized live verification still requires private Sandbox credentials, expected merchant ID, a fictional funded buyer, exact `APP_ORIGIN`, database mode and explicit `PAYPAL_CHECKOUT_ENABLED=true`. See [docs/PAYPAL.md](PAYPAL.md). Never paste passwords into Git. Render account/GitHub connection/plan approval are still needed for public deployment. HTTPS webhook setup is deferred, not claimed as verified.

## Redesign boundaries

The redesign changes presentation, appearance preference and tests, not financial behavior. Database/schema/migrations, domain repositories, commerce services, API routes and provider verification remain unchanged. No live provider call was made for redesign testing. Product Care, monitoring, refunds and sponsor integrations are still planned; polished cards do not indicate connected services. The existing expired-checkout approval-control defect and buyer-approval rejection are not fixed by the new UI.

A feature is only marked complete after a reproducible test or actual external-provider evidence. Mock data and UI prototypes must remain identified as such.
