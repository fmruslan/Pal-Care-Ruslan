# Owner-private testing readiness audit

Date: 2026-10-27. Verdict: **ready for bounded owner testing**, not public deployment.

## Fresh checks

- Private listener binds only `127.0.0.1:3002`. `/api/ready` returned HTTP 200 with database source, subscription mode, checkout/Guardian disabled and fixture discovery.
- Owner session is unblocked, 25/50 inference requests consumed, expiry **2026-10-28 16:42:26 UTC**. The allowance was neither reset nor extended during this audit.
- Both customer/Studio capabilities unlock with HttpOnly/SameSite=Strict cookies; unauthenticated AI conversation creation returns 403.
- Actual browser pages `/ai-evaluation`, `/dashboard`, `/vault`, Pi care and merchant intelligence load; actual Studio widgets/request form and subscription-labeled customer assistant are available.
- Credential/artifact scan passed: 22 browser artifacts checked, no private host files bundled. Preservation recheck passed for the established 17 readable source tables, three original CareOS rows, legacy spend rows and original 0015-compatible 29-table schema.
- These fresh checks made **zero model calls**, financial requests or external browser requests. Scope unlock and empty/saved-record-only test conversations are ordinary bounded application writes, not a database migration.

## Finding corrected before handoff

A read-only reviewer found that `proof of payment` routed to receipts but was omitted from the explicit receipt-target guard. With Forma selected, a JBL proof-of-payment request could incorrectly return the selected receipt. The same target guard now covers `receipt`, `invoice` and `proof of payment` consistently.

Added four unit regressions (foreign-brand forms plus selected-product positive controls). Actual browser checks passed for both JBL phrasings returning selection/no document and generic proof of this purchase returning the correct selected receipt. All three were deterministic; no inference used.

Local verification: **366 unit tests**, lint, typecheck, formatting and production build pass. Prior head `aa623c6` has fully passing CI; the audit correction's exact-commit CI is reported separately at delivery, not inferred from that earlier run.

## Remaining owner-visible limits

- Pi 5/Raspberry Pi OS source coverage is narrow; Forma has no manual. One historical recall notice cannot establish current safety status.
- Care responses previously measured 6.8–10.7 seconds; four same-product turns provide bounded context. Generic unavailable errors may need operator inspection if a session expires or a provider denies access.
- The private file allowance and owner-only localhost scopes are suitable for this single-host development preview, not multi-instance production or a substitute for public OS isolation/licensing.
- No new model call was made to revalidate provider availability during this audit. Genuine model/Studio acceptance is documented in [the preceding live evaluation](SUBSCRIPTION-QUALITY.md); current local access/readiness is checked separately here.

## Owner handoff

Use Mac SSH local forwarding to GreatBison's loopback port 3002; visit `http://127.0.0.1:3002/ai-evaluation` in that Mac browser and authorize the matching private scope. Share application capabilities only through the private SSH channel/clipboard, never chat or URLs. These are not OpenAI credentials. Then test `/vault` and `/merchant/intelligence`. Guide the owner one Terminal command at a time.
