# Stage 4 verification — implementation versus provider acceptance

## Authorization boundary

Implementation and nonfinancial tests only. **No actual new Sandbox purchase or refund, model call, paid service activation or cloud deployment has been performed.** Existing completed Stage 2 capture/Twin and pending eCheck must remain unchanged. Actual refund lifecycle and unknown-ID recovery remain unverified until separately authorized.

## Reproducible automated evidence

- Lint, typecheck, **215 unit tests** and final production build pass. This includes exact policy/exclusions, explicit partial amount, financial configuration, optional recovery/correlation, independent evidence, analytics and strict operator-origin regressions.
- `pnpm test:integration`: **88 dedicated-PostgreSQL tests pass**, including 25 new Guardian cases and all 63 original cases. Coverage includes legacy preservation, opt-in binding, stale/expired approvals, wrong scopes, concurrency, external pending refunds, once-only intent/key, pending/failed/cancelled/unknown outcomes, missing/ambiguous correlation, wrong parent, retrieval failures, contradictory capture status, restricted-writer preflight, atomic analytics and reconciliation beyond the initial deadline.
- Both full normal browser modes pass: **312 fixture + 312 dedicated-database checks**, across desktop/tablet/mobile in light/dark. Existing screenshot baselines compare without updates. These cover all prior CareOS/checkout/appearance regressions and new Guardian public/auth/accessibility boundaries.
- Exclusive synthetic customer → protected merchant approval → injected refund → unchanged receipt flow: **6/6 projects pass**. Browser provider/financial dispatch is disabled; the refund double is Node-only.
- Representative synthetic opportunity screenshots were inspected in desktop light and mobile dark. They preserve semantic Blue/Lavender tokens and distinguish opportunity from provider completion. Synthetic images are ignored test artifacts, not actual-provider evidence.
- Local additive migrations/seed preservation check **passes twice**: every row in all twelve pre-existing tables is unchanged; v2 remains an inactive draft; no grants/bindings/cases/refunds/price events created in the application database. No old request key, capture reference, policy or eCheck changed.
- Final focused Guardian public/accessibility/API checks pass **18/18**; exclusive flow was rerun after analytics/financial hardening and again passes **6/6**. Production-server unavailable-database test passes **1/1**, with sanitized errors and no fixture substitution.
- Frozen-lockfile install, formatting, repository baseline and diff checks pass. `pnpm audit --prod` reports no known vulnerabilities; this is not a security certification. No dependency/provider was added.
- Exact-SHA GitHub Actions is verified at delivery and linked in the release response; CI has no provider credentials and is not actual Sandbox acceptance evidence.

Tests use injected gateways. A synthetic test-DB completed state or screenshot is **not actual PayPal proof**. No synthetic capture/refund is seeded into the application database. Fixtures are labeled non-entitlement illustrations.

## Actual-provider acceptance still pending

After separate approval: one new isolated USD 129.00 purchase under an activated v2 snapshot, controlled $109 merchant price, fresh exact-case approval, one $20 refund, independent Orders/capture/refund retrieval, unchanged original receipt and exactly-once event/analytics. Run the read-only verifier to report actual optional collection/correlation availability. Missing/ambiguous evidence must remain blocked; no financial retries or additional purchase workaround. No real-money benefit, webhook delivery or continuous scheduling is claimed.
