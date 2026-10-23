# HTTP surface — Sandbox commerce and bounded CareOS

Customer/merchant dashboards remain public and read-only. CareOS writes only its own bounded cookie-scoped conversations/quotas. Explicitly enabled checkout endpoints create/capture **Sandbox-only** orders for the originating browser. Stage 4 adds separate protected operator actions; financial dispatch defaults off and actual refund acceptance remains unverified. Model inference is separately gated and unverified. No real money.

## Stage 5 cohesion and local readiness

- Database runtime connections are explicit least-privilege capabilities, including fixture-mode CareOS persistence. Missing writers never use the reader/owner URL. Actual credentials and migrations must be separately provisioned/verified; see [setup](SETUP.md).
- `/safety` and `/replacements` accept a validated `twinId` or allowlisted `example=insignia`, never both. Saved product/category is resolved server-side; category-only browsing accepts `headphones` or `air-fryer`. Unsupported products never substitute unrelated categories. Invalid contexts return 404. Reference ownership is never represented as a verified purchase/receipt.
- Twin, document/download and Guardian case detail resolve by scoped ID, independently of bounded list windows. Purchase activity joins existing source ledgers read-only, with partial-source disclosure and separate proposed/pending/verified states.
- Operator action responses contain the current Guardian projection; successful mutations refresh the saved UI state, never optimistically declare completion or replay a timed-out action.
- Readiness checks exact origin, enabled-feature local configuration, required schema/positive grants/forbidden authority and active evidence guards. It has a three-second response deadline; metadata is cached for 30 seconds, connectivity/seed presence checked every time. Success is not provider compatibility, license coverage or production certification. No paid, financial or external-source call occurs.

## Stage 4 Guardian contract

`GET /merchant/intelligence` adds a read-only merchant workspace over the existing Guardian projection. Actual AG Studio 3.0.0 is dynamically opened for local evaluation; it adds no financial endpoint or authority. Separate illustrative data never enters financial tables. Dashboard filters describe the bounded fact window, not the separate all-record totals. See [intelligence contract/licensing](INTELLIGENCE.md).

- `GET /guardian`, `GET /guardian/:uuid`: proactive opportunity/evidence pages; no customer claim workflow. Unknown/malformed cases return 404.
- `GET /api/guardian`: fixed-scope read-only overview, evidence and state-separated analytics. Database failure returns sanitized 503, never fixture substitution.
- `GET /api/guardian/analytics`: versioned `guardian-analytics-v1` USD minor-unit metrics and 500-newest-case facts with timestamps, states and links. Totals cover all scoped cases; sample illustrations are excluded. Local AG Studio uses validated Guardian projections; no financial tool is exposed.
- `GET /api/operator/session`: private session/action scope and enabled-state view; no grant issuance.
- `POST /api/operator/session`: strict `{code}` (64 hex chars), one-use CLI-issued capability → separate one-hour HttpOnly cookie. Exact Origin/JSON ≤2 KiB required; persistent global activation budget. This is not customer sign-in.
- `POST /api/operator/guardian`: strict discriminated action body: `{action:"publish-policy"}`, `{action:"publish-price",requestId,direction:"drop"|"restore"}`, `{action:"approve",caseId,revision,requestId}`, `{action:"execute",caseId,revision}`, or `{action:"reconcile",caseId}`. Server-authorized exact action/case only; no visitor amount/capture/merchant IDs. Publishes only fixed $109/$129 catalog prices. Approval does not dispatch. Execute additionally requires explicit financial scope/restricted writer/budget; reconcile retrieves only an attempted refund. Both default off.

JSON responses are private/no-store with Cookie variance; unknown errors are sanitized. 403 denied scope/origin, 409 stale/conflicting state, 429 persistent limit, 503 disabled/misconfigured/unavailable. No HTTP 200 alone proves financial completion. All new routes reject unsupported methods. No webhook, seed, grant-issuance or public job endpoint. [Policy, state machine, limits and optional-field recovery](PRICE-GUARDIAN.md).

New checkout JSON permits only optional `offerHash` in addition to the original `{productId,requestId}`. An explicitly enabled covered purchase requires the current SHA-256 offer hash; no retroactive binding or client-chosen terms/amount. Historical retries retain original snapshots. This supersedes the earlier strictly-two-field description below, not its immediate-payment scope.

## CareOS final contract

Continuation adds read-only page routes `/merchant/intelligence`, `/safety` (optional allowlisted `example=insignia`) and `/replacements` (two validated categories). These introduce no public source-refresh, credit-spending search or financial endpoint. CPSC GET pages read bundled/stored official snapshots, not live remote queries. Replacement pages default to clearly labeled fixtures; the separately gated real mode refreshes curated product IDs under a persistent read cap and fails visibly without fixture substitution. CareOS's intent allowlist now includes `recall`; explanations cite supplied validated historical evidence and do not establish physical identity or full recall coverage. Replacement navigation never dispatches a search/model/payment.

`POST /api/careos/conversations` accepts empty JSON and issues a separate HttpOnly cookie. Owned `GET`/`DELETE /api/careos/conversations/:uuid` restores/clears a transcript; cookie mismatch/expiry returns 404. `POST .../:uuid/turns` accepts only `{requestId, twinId: UUID|null, revision: integer, message: string, intent?: allowlisted, example?: "insignia"}`. An example requires `twinId:null`; mixed scopes are rejected. It returns a saved turn containing typed outcome, server-assigned execution mode, bound context/revision, concise text/steps, sources and application-generated navigation actions. Repeated IDs return the original result; changed payloads return 409. An unknown/in-progress dispatch is never blindly repeated. Independent internal per-call settlement does not expose a spending or settlement endpoint.

Mutations require exact configured `APP_ORIGIN`; JSON is at most 16 KiB and messages at most 2,000 characters. History, customer/merchant IDs, arbitrary tools/URLs and financial parameters are rejected. Database mode persists conversations/quotas in CareOS-only tables; fixture-data mode uses bounded ephemeral memory and cannot activate paid inference. HTTP 429 supplies `Retry-After`; safe 503 failures never fall back to fixtures. No conversation data is publicly cacheable. [Limits and activation gates](CAREOS.md).

`GET /documents/:uuid` renders the actual scoped document with its provenance and original download link. `GET /vault/:uuid/care` displays only exact-product documentation with attribution/revision/hash; neither route calls a model. Dashboard suggestions are deterministic server projections and cost no model credits.

Actual Orders/Payments completed-capture and exactly-one Twin/receipt/policy/event acceptance passed for the separately approved USD 129.00 case. Repeated read-only verification preserved all records. This is not a webhook, production-readiness or blanket provider-negative-testing claim; the separate eCheck remains preserved. [Evidence](evidence/STAGE2-VERIFICATION.md).

The premium appearance layer adds no HTTP endpoints. Light/Dark/System preference is browser-local; theme changes must not issue payment POSTs or change checkout authorization. The Stage 2 expiry follow-up preserves those appearance and authorization boundaries.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Product landing page and links to both demos |
| GET | `/dashboard` | Fictional customer overview, sample counts, Twins and events |
| GET | `/vault?q=…&category=…` | Search/category filter over up to 100 most recent demo Twins; no writes; source labels separate samples from sandbox |
| GET | `/vault/:uuid` | Scoped Twin snapshot, documents and evidence by ID, including older records outside list windows; malformed/unknown/out-of-scope returns 404 |
| GET | `/documents` | Public fictional documents; no upload capability |
| GET | `/merchant` | Public read-only merchant overview with separate intelligence/operator navigation |
| GET | `/api/documents/:uuid/download` | Scoped sample/sandbox text attachment with provenance-specific filename; 404 if malformed/unknown; POST returns 405 |
| GET | `/api/health` | Liveness JSON, `payments: sandbox-configurable`; not evidence of provider access |
| GET | `/api/ready` | Local readiness as above; sanitized 503 on unsafe/missing required configuration, grants, schema/guards, seed or database; no provider calls |
| GET | `/shop` | Public fictional catalog; disabled buttons if Sandbox configuration is unavailable |
| GET | `/checkout/:uuid` | Browser checkout status UI; GET/query parameters do not perform capture |
| POST | `/api/checkout/orders` | JSON `{productId, requestId}` UUIDs only; trusted server price/product/policy; returns local checkout view and an HttpOnly cookie |
| GET | `/api/checkout/orders/:uuid` | Owned checkout status from DB, no provider call; same cookie required |
| POST | `/api/checkout/orders/:uuid/capture` | JSON `{}`; exact Origin + owning cookie; retrieve/validate order, capture once if approved, retrieve order/capture, atomically persist Twin only on completed evidence |
| POST | `/api/checkout/orders/:uuid/reconcile` | JSON `{}`; exact Origin + owning cookie; reconcile an already-attempted checkout with provider GETs only; persist status or atomically create its verified Twin; never create/capture a payment |
| POST | `/api/checkout/orders/:uuid/cancel` | JSON `{}`; cancel only an unattempted local checkout; never reverses/refunds a payment |
| POST | `/api/checkout/orders/:uuid/retry` | JSON `{}`; retry uncertain creation with original saved request key/body inside its two-hour deadline |

Mutation routes require configured database mode, `PAYPAL_CHECKOUT_ENABLED=true`, an exact trusted `APP_ORIGIN`, server-only Sandbox app credentials and expected payee ID. They reject cross-origin/missing Origin, non-JSON, bodies over 2 KiB, unsupported fields and unknown sessions. Provider IDs/prices/merchant scope cannot be supplied by visitors. Status/error responses are `no-store`; no raw provider or payer data is returned.

HTTP 200 is not proof of payment: inspect the returned `state`. Only `completed` with a durable `twinId` means provider evidence validated. Pending/failed/cancelled/review states create no verified Twin. HTTP 503 means disabled/misconfigured/unavailable; 403 origin rejection; 404 unknown checkout/session; 409 conflicting operation; 429 persistent safety quota (`Retry-After` supplied).

### One-order immediate-payment scope

The creation JSON remains strictly `{productId, requestId}`. Visitors cannot choose a payment preference, supply an amount or set the buyer-balance confirmation. An optional operator-only scope allowlists one request UUID/session digest for the fixed USD 129.00 headphones SKU. Before balance confirmation, new creation returns `sandbox_balance_confirmation_required` with no checkout insertion/provider call. Wrong browser/request/SKU returns `sandbox_test_not_authorized`; a changed catalog price returns `sandbox_test_price_changed`. Original same-session idempotent requests continue to return their existing checkout without modifying it.

After confirmation, only the owning browser receives the reserved request ID as a shop control prop; this UUID is not authorization without its HttpOnly cookie and exact Origin. Request uniqueness plus the existing transaction/lease/quotas prevent another checkout. `IMMEDIATE_PAYMENT_REQUIRED` is saved before provider dispatch and used only from that order's snapshot, never from mutable retry-time configuration. Legacy null values omit the preference and preserve old create bodies. This adds no operator-grant endpoint and grants no merchant-write/refund authority. [Procedure](PAYPAL.md#one-separate-immediate-payment-test).

### Checkout deadline contract

Checkout views include `expiresAt` (the saved ISO deadline) and `captureAttempted` (a boolean, never an authorization token). At or after the deadline, an unattempted nonterminal checkout reports `state: "expired"`, `error: "checkout_expired"` and `approvalUrl: null`. Expiry is derived; no database schema/state migration or deadline extension is involved. GET status remains read-only and never calls PayPal. Repeated creation/retry/capture requests cannot revive an expired unattempted checkout or dispatch another provider operation.

The browser hides approval, capture, cancellation and creation-retry controls for an expired view. A local deadline timer removes stale controls without polling or making requests. A PayPal return first reads status; an expired checkout does not trigger an automatic capture POST. The server independently checks expiry before dispatching a first capture, including when the deadline passes during provider retrieval. Client time is presentation only, never payment authority.

An already-attempted capture remains `pending`/`capturing` and can reconcile after expiry; it must not be discarded, locally cancelled or recaptured. Completed and other terminal states are not replaced by expiry. Local cancellation of an unattempted order retains evidence and request keys and is not a PayPal refund or provider cancellation.

### Capture reconciliation contract

`reconcile` is **read-only at PayPal**, not at PostgreSQL: it can save an observation or finalize a verified Twin. It rejects an unattempted nonterminal checkout with `capture_not_attempted` before provider calls. Completed/cancelled/failed/review states return their existing view without executing a payment. It shares the durable lease and persistent provider budgets. The original deadline blocks a *first* capture, never the retrieval of an already-attempted payment.

The service validates current Orders v2 evidence and pins its single capture ID in `observed_capture_id` even when pending. Future checks cannot switch that identity or accept a capture ID from the visitor. It always independently retrieves that ID through Payments v2, validates ID/amount/currency/final-capture/timestamp and any supplied related-order/application references, and records `capture_status`, allowlisted `capture_pending_reason` and `capture_checked_at`. Migrations `0003_flat_ares.sql` and `0004_minor_whizzer.sql` add these nullable fields/constraints and preserve existing observed IDs without fabricating statuses or changing keys/deadlines. The original `provider_capture_id` stays reserved for atomic completed-payment evidence; a pending observation cannot satisfy the verified Twin's foreign-key reference.

Checkout JSON adds `captureStatus`, `pendingReason` (`ECHECK` or null) and ISO `captureCheckedAt`. No raw payer details/provider text are returned. `PENDING` stays unverified, with an eCheck-specific explanation when known. `FAILED`/`DECLINED` produce `state: failed` and `capture_failed`/`capture_declined`, retaining the identity and attempt marker without a Twin. Unknown/mismatched evidence requires review; transient retrieval failures stay pending. Both APIs must agree on completed capture evidence before atomic, exactly-once Twin/receipt/policy/event persistence. A pending observation is not completed-payment proof.

Attempted checkouts display **Check payment status**, which posts only to `reconcile`; returning already-attempted checkouts reconcile once rather than calling capture. No status polling or appearance-triggered requests are introduced. The legacy capture action also cannot recapture an attempted checkout.

GET routes also support framework HEAD handling. No webhook or seed HTTP route exists. Stage 4 operator routes are separately protected as above; CareOS cannot invoke them. See [future webhook assessment](PAYPAL-WEBHOOKS.md). CLI migrations/seeds are operator tasks. `pnpm paypal:verify LOCAL_CHECKOUT_UUID` is an operator-only read-only actual-provider verifier, now supporting historical refunded lifecycle separately from first-capture verification; no browser/API endpoint can fake its result. `pnpm guardian:verify CASE_UUID` is prepared for separately approved read-only refund/recovery acceptance and has not been run.
