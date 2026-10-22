# Implementation status

Last updated: 2026-10-21

> **Stage 1 application foundation is implemented and locally tested.** Public dashboards and sample records work with both bundled preview data and real local PostgreSQL. **PayPal, AI, sponsor integrations and a Render-hosted deployment are not yet implemented/verified.** Infrastructure now follows [ADR 0002](adr/0002-public-render-demo.md); Supabase and customer login are not used.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Next.js 16 / React / TypeScript / Tailwind / shadcn-based UI | **Implemented** | Production build, lint and typecheck pass; premium responsive shell and original illustrations |
| Public customer and merchant dashboards | **Implemented** | Browsable without login; no mutation controls/endpoints |
| Purchase Vault and Twin detail pages | **Implemented with sample data** | Three fictional records, working search/category filter, no-result state and detail links |
| Documents and care history | **Implemented with sample data** | Three original public text attachments/events; no real manuals, uploads or active monitoring |
| PostgreSQL / Drizzle migrations and seed | **Implemented; local PostgreSQL verified** | Six tables, reviewed SQL, repeatable migration/seed, relational and provenance constraints |
| Read-only access and secure configuration | **Implemented for public sample scope** | Server-only repository, fixed demo IDs, read-only database sessions, validation, bounded pool/timeouts and baseline headers |
| CI foundation | **Verified on GitHub** | [Passing foundation run](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39709677502) at `b5a260a`; subsequent workflow hardening pins current Node 24 actions and Ubuntu 24.04; check latest run for current commit |
| Render deployment preparation | **Prepared, not deployed** | `render.yaml`, private-network DB, readiness, pre-deploy migration/seed and setup guide; account/billing approval needed |
| Supabase / customer login / private uploads | **Excluded by design** | Replaced by Render PostgreSQL and public fictional identities |
| PayPal sandbox payment capture | Not started | Verified provider response |
| Purchase Twin generation | Not started | Durable record created after real capture |
| Price Guardian and partial refund | Not started | Authorized merchant approval and verified PayPal refund |
| CPSC candidate matching | Not started | Real source data and model verification |
| Product Care assistant | Not started | Grounded answer from actual manual |
| Channel3 discovery | Not started | Live product results and retailer links |
| AG Studio intelligence | Not started | Real custom widget and agent interaction |
| Public deployment and demo | Not started | Accessible URL and public video |

## Local verification

- `pnpm install --frozen-lockfile`: reproducible installation.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: pass.
- Unit tests: **25 passed**, covering configuration, sample integrity, lookup scoping, IDs, money formatting, UTC dates and explicit data-source/error boundaries (repository boundary tests use unit mocks).
- PostgreSQL integration: **7 passed** against local PostgreSQL 17, with no mocked database. Tests run migrations/seeds twice, reject writes on runtime connections, invalid prices/currency, mismatched products/merchants, orphan documents and relabeled sample provenance.
- Playwright: **24 passed in fixture mode + 24 passed in database mode**, desktop and mobile Chromium. Includes navigation/search, downloads, invalid IDs/methods, absent mutation routes, security headers, six-page axe WCAG A/AA scans and page-width checks.
- Production-server failure test: **1 passed**, confirming an unavailable PostgreSQL database returns readiness 503 without a fixture fallback or DSN disclosure.
- Render Blueprint: validated against Render's official JSON schema; account-level/cloud deployment remains unverified.
- `pnpm audit --prod`: no known runtime dependency vulnerabilities at verification time.
- Automated accessibility checks are a baseline, not a full manual accessibility certification or security audit.

## Stage 2 readiness and prerequisites

The repository, schema/migration workflow, server-only data boundary, public UI, sample fixtures and tests are ready for the next slice. Stage 2 must add verified PayPal order/capture records and a new sandbox-provenance migration before creating real sandbox Purchase Twins. No sample row may be relabeled as verified evidence.

External setup still needed: Render account/GitHub authorization and paid-plan approval; PayPal Developer sandbox merchant/buyer/app and webhook configuration for Stage 2. No AI/Channel3/AG Studio credentials are needed for Stage 1. Operator authorization, persistent rate limits and budgets are required before consequential or paid-provider endpoints are exposed.

A feature is only marked complete after a reproducible test or actual external-provider evidence. Mock data and UI prototypes must remain identified as such.
