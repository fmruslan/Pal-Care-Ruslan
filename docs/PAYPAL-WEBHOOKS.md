# Verified PayPal webhooks after Render — assessment only

**Planned, not implemented or delivery-verified.** No listener, registered webhook ID, inbox or worker is shipped in this slice. Current reconciliation retrieves Orders v2 and Payments v2 directly. A mock event cannot establish actual delivery, signature verification or completed payment.

## Deployment prerequisites

1. Deploy to Render with persistent PostgreSQL, reviewed migrations, readiness checks and a **public HTTPS listener on port 443**. A tailnet-only URL is not reachable by PayPal. Configure the canonical `APP_ORIGIN` explicitly, never from an untrusted request Host.
2. Register a listener such as `/api/paypal/webhooks` under the **same Sandbox REST app and merchant** that own the orders. Keep the returned webhook ID server-side; it is not an event/order/capture ID. Registration is an operator action, not automatic on each startup. Production PayPal remains disabled.
3. Subscribe to documented Payments v2 events `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DECLINED`. The capture API also reports `FAILED`; do not invent a `PAYMENT.CAPTURE.FAILED` subscription absent supported event discovery/documentation. Approval events are not completed-payment evidence and must not trigger another capture.
4. Decide how to record/flag future `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.CAPTURE.REVERSED` events. Refund/reversal handling needs separate scope and tests; such events must not create a new completed purchase or execute a refund.
5. Preserve existing localhost checkout origins, cookies, references and keys. Registration does not guarantee retroactive delivery of earlier events. Retain manual reconciliation of the existing eCheck; do not create another transaction just to test webhooks without explicit authorization.

## Signature verification and ingress

The future webhook POST is **provider-authenticated**, not browser-cookie/Origin authenticated. Do not weaken existing checkout authorizers to accommodate it.

- Bound body size/content type, read the original raw bytes once, validate required PayPal transmission headers and treat the event as untrusted until verified. Do not log raw headers/bodies, which may contain signatures and payer information.
- Use the configured app-specific webhook ID, never one supplied by the request. Missing/invalid signatures cannot authorize processing.
- PayPal recommends **self cryptographic verification**. It requires CRC32 of the raw body and signature verification over `transmissionId|transmissionTime|webhookId|crc32`. Certificate retrieval needs PayPal HTTPS host/path allowlists, SSRF/private-address protection, no unchecked redirects, certificate validation, supported algorithms, bounded caching/time/size and a maintained pinned CRC32 library. Never fetch arbitrary event links.
- Alternatively use Sandbox `/v1/notifications/verify-webhook-signature`, retaining the received event faithfully and requiring `verification_status: SUCCESS`. Keep OAuth on the server and the API endpoint fixed. Do not parse/re-serialize away the original event representation. A network failure is not verification success. Choose/test one method before implementation.
- Add persistent ingress/provider budgets so unauthenticated requests cannot exhaust verification API calls. Use retry-aware transmission validation and a durable event ledger; an overly short event-creation-age cutoff can reject legitimate delayed deliveries. Do not assume events arrive once or in order.

## Durable inbox and reconciliation

Add a reviewed **versioned migration**, not schema-push, for a minimal inbox: environment/app scope, unique PayPal event ID, selected order/capture references, type/time, body digest, verification/receipt times, processing status, attempts and retry deadline. Do not persist the full payer-bearing payload by default. Verify authenticity before trusting a claimed duplicate ID.

Acknowledge 2xx after verified events are durably recorded, then process with a bounded durable worker/job in the modular monolith. Return a retryable failure for transient persistence or verification-infrastructure failures. Invalid signatures never authorize processing; a verified unsupported event may be acknowledged without financial effects.

Processing must:

1. Map to an existing fixed-merchant checkout using validated stored references and environment/app/payee scope. Unknown IDs do not authorize new orders or arbitrary merchant writes.
2. Require the saved attempted-capture marker. Use internally scoped **retrieval-only** provider capabilities and the existing reconciliation service, not a visitor cookie or an unrestricted public operator endpoint.
3. Retrieve current Orders v2 and the pinned Payments v2 capture from fixed endpoints. Validate saved product/reference/invoice, payee, USD integer amount, IDs, final-capture flag and timestamps. The event is a reconciliation notification, not sufficient payment proof.
4. Reuse durable leases, budgets and atomic Twin/receipt/policy/event insertion. Duplicate deliveries, worker retries, concurrent browser checks and out-of-order events must not duplicate Twins, recapture, or regress completed records to pending.
5. Persist retries across Render restarts/deploys, with bounded backoff, review/dead-letter handling and sanitized alerts for failed verification, delivery gaps and processing lag. In-memory timers or request-handler background promises are insufficient.

## Acceptance evidence before claiming implementation

- Invalid/missing headers, tampered body, wrong webhook ID/app/environment/payee, invalid certificate host/redirect, oversize input, replay, unknown capture and provider/DB timeout tests.
- PostgreSQL tests for inbox uniqueness, restart-safe retries, browser/worker concurrency and exactly-one Twin/receipt/policy/event. Webhook processing must make zero provider mutation calls.
- Out-of-order/repeated pending/completed/declined events reconcile current provider truth. Approval cannot create a verified purchase; failed/declined capture cannot create a verified Twin.
- **Actual Sandbox delivery to Render HTTPS**, valid signature verification, durable readback and safe resend/replay evidence. Never call signature verification implemented/tested until actual delivery is verified.
- Simulator events remain labeled mock tests. PayPal documents that postback verification is **not supported for simulator mock events**; self verification uses the simulator's special `WEBHOOK_ID`. Never weaken the real listener to make mocks appear app-authentic.

PayPal currently documents failed-delivery retries up to **25 times over 3 days**; recheck at implementation time. Delivery retries do not replace durable local processing or manual reconciliation.

## Official sources reviewed

- [Integrate and verify webhooks](https://developer.paypal.com/api/rest/webhooks/rest.md)
- [Payments v2 webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names.md)
- [Webhooks API](https://developer.paypal.com/api/webhooks/v1/)
- [Payments v2 status schema](https://developer.paypal.com/api/payments/v2/schema.json)
