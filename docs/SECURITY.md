# Security and privacy design

## Sensitive assets

Sensitive assets include database URLs, PayPal app credentials/OAuth tokens, anonymous checkout capabilities and selected sandbox transaction references. Product/customer data is fictional and public. No real customer data is allowed. Raw provider responses and payer identity are never persisted or logged.

## Current public-demo boundary

- No Supabase, login, registration or personal uploads. Public read-only dashboards plus an explicitly enabled, cookie-authorized sandbox checkout are the only surface. No merchant-edit, refund, seed or DB-admin endpoints.
- Server-only repository and PostgreSQL read-only sessions; scoped queries use fixed demo identities and bind parameters. Connection/query timeouts and pool size are bounded.
- Sample/sandbox provenance and USD integer prices are database-constrained. Sandbox checkout prices are positive and capped at USD 200.00; one item per order. Samples never imply payment; sandbox receipts require validated captured-payment evidence.
- Database mode reports errors instead of falling back; readiness returns 503. Browser-visible errors never include connection strings or raw SQL. Migration/seed errors are also redacted.
- Render blocks external database access; local PostgreSQL binds to loopback. Checkout defaults off. Enable only with private Sandbox credentials and exact HTTPS (or localhost HTTP) origin configuration.
- Headers deny framing/object embedding and enable MIME sniffing protection, permissions and referrer policies. This is a baseline, not a complete production CSP or independent security audit.
- Future financial/merchant actions need separate operator authorization. Persistent rate limits and paid-resource budgets must be implemented **before** exposing those endpoints; they are not claimed as implemented now.

### Implemented checkout safeguards (completed settlement not yet live-verified)

- 256-bit HttpOnly/SameSite=Lax browser cookie; Secure on HTTPS. Only SHA-256 token digests are stored. A checkout UUID/return token is not authorization.
- Exact Origin checks, JSON-only 2 KiB request bodies, UUID/product allowlists; no visitor-supplied amount/currency/merchant parameters.
- PostgreSQL counters: 3 new orders/session/hour, 10 globally/hour, 30 globally/day. Provider operations additionally have per-order/global hourly/daily limits. No IP addresses are retained.
- Persisted create/capture UUIDs, a two-hour create deadline and durable concurrent-operation leases. Capture intent is saved before dispatch; ambiguous captures only reconcile. An operator must investigate unresolved attempts, not reset their markers or invent completion.
- The same-origin, cookie-bound `reconcile` action requires an already-attempted payment, accepts no visitor capture ID and cannot create/capture at PayPal. Existing capture identity is pinned from validated order evidence and independently retrieved through Payments v2. Expiry does not disable attempted-capture reconciliation. Status observations alone do not authorize a verified Twin; pending, failed, declined, mismatched or incomplete evidence cannot fabricate completion.
- Retrieve and validate both order and capture: status, amount/currency, merchant, item SKU/quantity, application references, final-capture flag and timestamps. Atomic Twin/document/event insertion and unique provider references prevent duplicate records.
- Original product/policy/callback/payee context is snapshotted. Raw SDK payload logging is not enabled; sanitized error status/debug IDs are the only provider diagnostics.
- No runtime mock-provider or arbitrary provider-base-URL switch. Tests inject doubles into the service or intercept browser transport only. Production SDK environment is hardcoded Sandbox.
- Webhooks are absent; signature verification/delivery has not been tested. See `docs/PAYPAL.md` before claiming live integration.
- `docs/PAYPAL-WEBHOOKS.md` assesses a future public-HTTPS listener, verification, inbox and retry/deduplication boundary. It adds no current webhook route or delivery claim.

## Required safeguards

1. **Authorization:** public reads expose fictional records only; future consequential operations must verify operator authority and exact merchant/record/action scope and limits on the server.
2. **Secret isolation:** only trusted server processes access database/provider secrets. Never commit `.env`, tokens or sandbox passwords. Use separate migration credentials and a least-privilege runtime database role before expanding to write workflows.
3. **Payment integrity:** use integer minor currency units, trusted PayPal captures and verified authorization and remaining refundable amount.
4. **Safe retries:** durable payment operation IDs, concurrency-safe reservations, no duplicate refunds after timeouts.
5. **Webhook authenticity:** validate PayPal webhook signatures and accept each provider event once.
6. **Documents:** current sample documents are public. Personal uploads are out of scope. Before adding private documents, explicitly design authorization, storage, validation and deletion.
7. **Prompt-injection resistance:** treat uploaded files and third-party text as untrusted content; AI output cannot change security policy.
8. **Truthful states:** requested, processing, completed and failed are distinct; completion depends on authoritative provider confirmation.
9. **Auditability:** append state changes with actor and source references, without unnecessarily storing or logging sensitive documents.
10. **Regression checks:** invalid ownership, cancelled checkout, simultaneous refund requests, webhook replays, unexpected policy versions and provider failures.

## Public demo

Use fictional identities and PayPal sandbox operations only. Never commit buyer passwords. Both dashboards are publicly browsable, not signed-in accounts; operator actions are separately protected. Respect manufacturer and retailer content licensing.

## Scope disclaimer

Pal Care does not independently underwrite warranties, issue insurance, decide PayPal Purchase Protection eligibility, or guarantee merchant price-match terms.
