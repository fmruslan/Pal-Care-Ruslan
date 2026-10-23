# Stage 3 — CareOS fixture/runtime-boundary verification

**Scope:** implemented Glance/Tap/Talk experience and prepared runtime adapter. **Not a claim of hosted model inference or completed live-AI submission acceptance.**

## Verified locally on 2026-10-23

- Lint, typecheck and production build passed.
- **195 unit tests passed**, including the 50-case versioned deterministic/fixture evaluation set. Responses protocol, refusal, invalid output, incomplete result, quote/source checks and injected-document financial-instruction rejection use test doubles/injected HTTP, never hosted inference.
- **63 PostgreSQL integration tests passed** against an explicit local dedicated `TEST_DATABASE_URL`: 53 preserved foundation/commerce cases plus 10 CareOS persistence/ownership/expiry/replay/concurrency/budget/permission/immutability cases. PayPal doubles remain confined to tests.
- One production-server failure test passed, checking database readiness and CareOS return sanitized 503 without fixture fallback or DSN disclosure.
- Frozen lockfile installation, formatting, repository validation and diff checks passed. Production dependency audit reported no known vulnerabilities; this is not a complete security audit.
- Thirty fixture-only visual references cover homepage, dashboard, Twin, shop and open CareOS across desktop/tablet/mobile and light/dark. Representative finished dashboard/Twin/assistant screens were visually inspected; compact mobile content and one global launcher avoid redundant chat controls. This is Chromium emulation, not real-device or screen-reader certification.

## Browser and CI acceptance

The full suite contains **294 checks per data mode**, across six Chromium projects, with navigation, context switching, stale responses, receipt/source retrieval, safe errors, HTTP ownership/origin/replay validation, accessibility, appearance, checkout regressions and 30 visual comparisons. Database browser mode is pinned to the dedicated test URL, never the application database. All paid/provider activation is explicitly disabled.

An initial parallel run had shared Playwright trace-directory `ENOENT` failures; it is **not counted as a passing suite**. Artifacts/reports now use separate `fixtures`/`database` directories. The isolated full reruns and commit-specific [GitHub Actions](https://github.com/fmruslan/Pal-Care-Ruslan/actions) are the final delivery gate. The delivery report identifies the exact commit SHA and run result; fixture results are not model-quality evidence.

## Existing application records

`pnpm exec tsx scripts/verify-careos-upgrade.ts --apply` passed twice against the existing local application database. It snapshots/hashes each existing row in all eight original tables, applies only reviewed versioned migrations and idempotent seeds, then compares every existing row unchanged. The repeat run did not duplicate reference/knowledge records. Migration 0006 adds knowledge; 0007 adds CareOS conversations/requests/budgets. No financial schema, key, deadline, capture marker or existing receipt/policy/event was rewritten.

The verified Forma F-01 purchase and separate pending eCheck are preserved. One separately labeled Raspberry Pi 5 sample ownership Twin is added, with licensed official documentation—not a payment, real ownership assertion, market price or warranty. The zero placeholder is not presented as a product price. [Source register](../CARE-SOURCES.md).

No PayPal or model API calls, additional purchases, refunds, webhook registration, or paid deployment were performed for this stage. Stage 2 actual-provider evidence remains [separate](STAGE2-VERIFICATION.md).

## Still requires separate approval/evidence

- A separately provisioned server API key, restricted CareOS DB login, explicit spending budget and live activation approval.
- Actual hosted inference/grounding/latency/usage evaluation before hackathon submission; protocol mocks and fixtures do not establish this.
- First-time-user task testing, real-device checks and separately approved public hosting/deployment.

See [CareOS operations and activation](../CAREOS.md). Runtime API credentials must never come from the owner's ChatGPT/OpenCode subscription tokens.
