# ADR 0009: Bounded Stage 5 hardening and product cohesion

**Status:** Accepted and implemented in code; actual application provisioning/migration pending separate owner approval.
**Date:** 2026-10-23

## Decision

Keep the Next.js modular monolith, PostgreSQL 17, Drizzle, current SDK versions and original design. Fix demonstrated defects without adding live services or expanding financial authority.

- Runtime database logins are explicit capabilities, not owner/general fallbacks. Inspect actual login/effective/assumable roles, ownership, PUBLIC/column/table grants and required operations. Migration/admin/grant-issuer/bootstrap secrets remain outside the web execution environment and readable deployment files.
- Global unsafe-authority checks remain fail-closed. Required read grants are specific to each operation so unrelated evidence failure cannot disable core receipt assistance. Full readiness checks the complete enabled deployment schema/capabilities without external calls.
- Reviewed migrations 0013/0015 protect original request snapshots/keys/deadlines and established evidence, while allowing valid leases, first finalization and reconciliation. Owners are still trusted administrators; triggers are not cryptographic tamper-proof storage.
- Migration 0014 adds per-call model reservations. Calls settle independently; unknown usage retains its full reservation; identical replay releases nothing twice; cleanup does not restore budgets. No legacy usage is invented/backfilled.
- Detail lookup is scoped by ID, independent of list windows. Journey context is a saved Twin or an explicit allowlisted example, never fabricated ownership. Unsupported categories never substitute unrelated products.
- Existing purchase/receipt/Guardian/recall ledgers feed one read-only activity projection with source labels and uncertainty. No writable master event store is introduced.
- Workspace controls, SDK widgets and scripted commands share stage selection. Widget and all-record scopes remain explicit. Public Studio licensing and live inference remain separate gates.
- Private recall ingestion processes bounded resumable pending batches. Scope stays one reviewed historical notice. Readiness is cheap, bounded and provider-free; compatible readers share pools without merging writer credentials.

## Acceptance and external gates

Use actual disposable restricted logins and dedicated local test databases, fixture/provider doubles, complete journey tests, cross-engine browser checks and exact-commit CI. Verify row preservation around upgrades, including completed/pending/cancelled synthetic legacy cases. Never run tests against the application database.

Report implementation, isolated tests, actual application verification and external blockers separately. Stage 5 does not authorize application migration/credential changes, PayPal purchases/refunds, paid inference, license activation or paid deployment. Final evidence and remaining steps: [Stage 5 ledger](../evidence/STAGE5-VERIFICATION.md).
