# Implementation status

Last updated: 2026-10-21

> **Stage 2 implementation and independent tests are available. Actual PayPal Sandbox verification is BLOCKED by missing credentials; Stage 2's Definition of Done is not satisfied.** Stage 1 remains working. Checkout defaults off and has no mock-provider mode. No real provider create/capture, actual buyer approval or webhook delivery has been verified. Supabase/customer login remain excluded.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Next.js 16 / React / TypeScript / Tailwind / shadcn-based UI | **Implemented** | Production build, lint and typecheck pass; premium responsive shell and original illustrations |
| Public customer and merchant dashboards | **Implemented** | Browsable without login; no mutation controls/endpoints |
| Purchase Vault and Twin detail pages | **Implemented; sandbox display independently tested** | Samples remain separate; new sandbox Twins use saved product/merchant snapshots and capture references |
| Documents and care history | **Implemented; sandbox persistence tested with provider double** | Original samples plus verified-capture receipt/policy/event path; no manufacturer manuals/warranties supplied |
| PostgreSQL / Drizzle migrations and seed | **Implemented; local PostgreSQL verified** | Eight tables; migrations 0001/0002 add checkout/rates, provider references, constrained provenance and globally unique client request IDs |
| Read-only dashboards + bounded checkout | **Implemented; independent tests pass** | Separate write service, cookie authorization, exact Origin, bounded JSON, DB-backed quotas/leases/idempotency |
| CI pipeline | **Configured; use commit-specific run evidence** | Commit-pinned Node 24 actions on Ubuntu 24.04 run quality checks, real PostgreSQL tests and both browser modes. See [latest runs](https://github.com/fmruslan/Pal-Care-Ruslan/actions) for the current commit; CI deliberately has no PayPal credentials and cannot prove actual Sandbox completion |
| Render deployment preparation | **Prepared, not deployed** | `render.yaml`, private-network DB, readiness, pre-deploy migration/seed and setup guide; account/billing approval needed |
| Supabase / customer login / private uploads | **Excluded by design** | Replaced by Render PostgreSQL and public fictional identities |
| Demo merchant catalog | **Implemented** | `/shop`, trusted allowlisted products and integer USD prices, clear disabled/configuration state |
| PayPal Sandbox create/approval/capture | **Implemented; LIVE VERIFICATION BLOCKED** | Official SDK and redirect flow; missing Sandbox app credentials/merchant/buyer configuration |
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
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: pass.
- Unit tests: **53 passed**, including configuration, verification of order/capture evidence, currency/amount/item/payee checks, authorization/body boundaries, sample integrity, snapshots and UI helpers. Unit-only provider payloads are not live proof.
- PostgreSQL integration: **26 passed** against a dedicated PostgreSQL 17 test database. **19 checkout cases use an injected PayPal double** to exercise atomic persistence/rollback, cancellation, declines, pending/ambiguous responses, concurrent/repeated attempts, lost initial cookies, saved product snapshots, ownership, expiry and quotas. Seven foundation tests verify migration/seed/integrity behavior. Test-origin sandbox rows are cleaned up and never seeded into the app database.
- Playwright: **36 passed in fixture mode + 36 passed in database mode**, desktop/mobile Chromium, including seven-page axe WCAG A/AA scans, shop disabled-state and forged-return checks. Checkout success/cancel/failure UI tests intercept HTTP responses and are explicitly labeled mock UI transport; they do not prove an actual PayPal purchase.
- Production-server failure test: **1 passed**, confirming an unavailable PostgreSQL database returns readiness 503 without a fixture fallback or DSN disclosure.
- Render Blueprint: validated against Render's official JSON schema; account-level/cloud deployment remains unverified.
- Stage 2 `pnpm audit --prod` was attempted, but the npm audit service timed out; no current audit result is claimed. Stage 1's earlier audit result is not evidence for newly added SDK dependencies.
- Automated accessibility checks are a baseline, not a full manual accessibility certification or security audit.

## Stage 2 readiness and prerequisites

The code path is ready for live testing, **not yet complete**. `pnpm paypal:verify` was executed and returned **BLOCKED (exit 2)** because real credentials are absent; no provider call was made. The command only passes when direct PayPal retrieval and a matching durable Twin/receipt both validate.

Required next: Sandbox REST app client ID/secret, the app merchant's 13-character Sandbox merchant ID, a fictional funded buyer, exact `APP_ORIGIN`, database mode and explicit `PAYPAL_CHECKOUT_ENABLED=true`. See [docs/PAYPAL.md](PAYPAL.md). Configure privately in `.env.local` or Render; never paste passwords into Git. Render account/GitHub connection/plan approval are still needed for public deployment. HTTPS webhook setup is deferred, not claimed as verified.

A feature is only marked complete after a reproducible test or actual external-provider evidence. Mock data and UI prototypes must remain identified as such.
