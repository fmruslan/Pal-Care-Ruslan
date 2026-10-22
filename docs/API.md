# HTTP surface — Stage 2 implementation (live PayPal verification blocked)

Customer/merchant dashboards remain public and read-only. Explicitly enabled checkout endpoints can create/capture **Sandbox-only** orders for the originating anonymous browser, with durable global/session/order limits. They default off. No refunds, merchant editing, AI or real money.

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
| POST | `/api/checkout/orders/:uuid/cancel` | JSON `{}`; cancel only an unattempted local checkout; never reverses/refunds a payment |
| POST | `/api/checkout/orders/:uuid/retry` | JSON `{}`; retry uncertain creation with original saved request key/body inside its two-hour deadline |

Mutation routes require configured database mode, `PAYPAL_CHECKOUT_ENABLED=true`, an exact trusted `APP_ORIGIN`, server-only Sandbox app credentials and expected payee ID. They reject cross-origin/missing Origin, non-JSON, bodies over 2 KiB, unsupported fields and unknown sessions. Provider IDs/prices/merchant scope cannot be supplied by visitors. Status/error responses are `no-store`; no raw provider or payer data is returned.

HTTP 200 is not proof of payment: inspect the returned `state`. Only `completed` with a durable `twinId` means provider evidence validated. Pending/failed/cancelled/review states create no verified Twin. HTTP 503 means disabled/misconfigured/unavailable; 403 origin rejection; 404 unknown checkout/session; 409 conflicting operation; 429 persistent safety quota (`Retry-After` supplied).

### Checkout deadline contract

Checkout views include `expiresAt` (the saved ISO deadline) and `captureAttempted` (a boolean, never an authorization token). At or after the deadline, an unattempted nonterminal checkout reports `state: "expired"`, `error: "checkout_expired"` and `approvalUrl: null`. Expiry is derived; no database schema/state migration or deadline extension is involved. GET status remains read-only and never calls PayPal. Repeated creation/retry/capture requests cannot revive an expired unattempted checkout or dispatch another provider operation.

The browser hides approval, capture, cancellation and creation-retry controls for an expired view. A local deadline timer removes stale controls without polling or making requests. A PayPal return first reads status; an expired checkout does not trigger an automatic capture POST. The server independently checks expiry before dispatching a first capture, including when the deadline passes during provider retrieval. Client time is presentation only, never payment authority.

An already-attempted capture remains `pending`/`capturing` and can reconcile after expiry; it must not be discarded, locally cancelled or recaptured. Completed and other terminal states are not replaced by expiry. Local cancellation of an unattempted order retains evidence and request keys and is not a PayPal refund or provider cancellation.

GET routes also support framework HEAD handling. No webhook, refund, merchant-approval, catalog-write, AI or seed HTTP routes exist. CLI migrations/seeds are operator tasks. `pnpm paypal:verify LOCAL_CHECKOUT_UUID` is an operator-only, read-only actual-provider verification command; no browser/API endpoint can fake its result.
