# HTTP surface — Stage 2 Sandbox purchase/Twin flow verified

Stage 3 increment 1 adds `/documents/:uuid` for scoped inline text viewing, `POST /api/careos/conversations` (empty JSON), owned `GET`/`DELETE /api/careos/conversations/:uuid`, and `POST /api/careos/conversations/:uuid/turns` (`requestId`, nullable `twinId`, `revision`, `message`, optional allowlisted `intent`). Mutations require exact configured `APP_ORIGIN`, bounded JSON and a separate HttpOnly CareOS capability. Initial conversations use a bounded, expiring preview store. These deterministic reads never invoke a model or PayPal.

Customer/merchant dashboards remain public and read-only. Explicitly enabled checkout endpoints can create/capture **Sandbox-only** orders for the originating anonymous browser, with durable global/session/order limits. They default off. No refunds, merchant editing, AI or real money.

Actual Orders/Payments completed-capture and exactly-one Twin/receipt/policy/event acceptance passed for the separately approved USD 129.00 case. Repeated read-only verification preserved all records. This is not a webhook, production-readiness or blanket provider-negative-testing claim; the separate eCheck remains preserved. [Evidence](evidence/STAGE2-VERIFICATION.md).

The premium appearance layer adds no HTTP endpoints. Light/Dark/System preference is browser-local; theme changes must not issue payment POSTs or change checkout authorization. The Stage 2 expiry follow-up preserves those appearance and authorization boundaries.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Product landing page and links to both demos |
| GET | `/dashboard` | Fictional customer overview, sample counts, Twins and events |
| GET | `/vault?q=…&category=…` | Search/category filter over up to 100 most recent demo Twins; no writes; source labels separate samples from sandbox |
| GET | `/vault/:uuid` | Twin snapshot, documents and evidence; 404 if malformed/unknown/not in current demo window |
| GET | `/documents` | Public fictional documents; no upload capability |
| GET | `/merchant` | Read-only sample inventory/events; future analytics placeholder |
| GET | `/api/documents/:uuid/download` | Scoped sample/sandbox text attachment with provenance-specific filename; 404 if malformed/unknown; POST returns 405 |
| GET | `/api/health` | Liveness JSON, `payments: sandbox-configurable`; not evidence of provider access |
| GET | `/api/ready` | Selected data source readiness; 503 on invalid config, unavailable DB or missing seed |
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

GET routes also support framework HEAD handling. No webhook, refund, merchant-approval, catalog-write, AI or seed HTTP routes exist. See [future verified-webhook assessment](PAYPAL-WEBHOOKS.md). CLI migrations/seeds are operator tasks. `pnpm paypal:verify LOCAL_CHECKOUT_UUID` is an operator-only, read-only actual-provider verification command; no browser/API endpoint can fake its result.
