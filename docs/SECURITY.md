# Security and privacy design

## Sensitive assets

Sensitive assets include database URLs, PayPal app credentials/OAuth tokens, anonymous checkout capabilities and selected sandbox transaction references. Product/customer data is fictional and public. No real customer data is allowed. Raw provider responses and payer identity are never persisted or logged.

## Current public-demo boundary

Continuation review: Studio receives only fixed-scope public fictional commerce projections; scripted tools can read schema and change browser dashboard presentation, never invoke commerce, arbitrary URLs or server SQL. Local evaluation needs an explicit server flag and trusted local origin, not Host alone. Layout restore accepts only bounded known widget positions. Paid inference is still disabled. CPSC retrieval pins one official endpoint/recall number, caps bytes/deadline, validates official URLs and hashes, and stops applicability matching on changed sources. Source/history is immutable; an unknown/missing identifier is not a safety confirmation. Recall text is untrusted quoted content, not permission or executable instructions.

Channel3 search is private CLI only, with explicit credentials/confirmed free-credit gates and atomic persistent reservations before dispatch. No automatic retry, billing or MPP fallback. Public real-mode reads use only curated IDs, refresh volatile offers, and have a persistent daily cap. Every offer must pass currency/category/condition/budget/link checks; unsupported/missing fields stay unavailable. The restricted writer template grants only discovery tables; actual PostgreSQL tests cover both rejecting an evidence-capable writer and accepting a least-privilege role that still cannot update checkout records. No account/credential/provider activation was performed. Automated tests have no live provider/model/financial authority. This review is not a penetration-test certification.

Stage 4 adds a separately protected operator surface, not public merchant authority. [Guardian security/state-machine contract](PRICE-GUARDIAN.md) supersedes earlier no-refund-route descriptions: all financial/provider flags default off; actual refund testing requires separate approval. CLI-issued single-use 256-bit hashed capabilities have short expiry, revocation, exact action/case scope, a separate HttpOnly cookie, exact Origin, bounded strict JSON and persistent limits. The read-only customer/merchant views grant none of these permissions. CareOS cannot mutate any Guardian/operator table.

Provider access requires an explicitly scoped Sandbox case/capture/experiment and separate restricted database writer; evidence-write privileges are rejected before reads/dispatch. Refund intent, hash, stable key and capture reservation commit before one POST. A saved operation blocks every later POST; uncertain results reconcile via retrieval only. Optional absent/ambiguous fields never establish successful recovery. Independent refund and capture-parent/lifecycle evidence is required. Original receipts/policy bindings/payment references remain untouched. The first-release isolated-capture limitation and inability to prove absence of external pending refunds are explicit; no production multi-actor guarantee is made. No provider/model calls occur in automated tests.

- No Supabase, customer login, registration or personal uploads. Public read-only dashboards, bounded cookie-authorized Sandbox checkout and separately gated operator actions only. No seed or DB-admin endpoints.
- Server-only repository and PostgreSQL read-only sessions; scoped queries use fixed demo identities and bind parameters. Connection/query timeouts and pool size are bounded.
- Sample/sandbox provenance and USD integer prices are database-constrained. Sandbox checkout prices are positive and capped at USD 200.00; one item per order. Samples never imply payment; sandbox receipts require validated captured-payment evidence.
- Database mode reports errors instead of falling back; readiness returns 503. Browser-visible errors never include connection strings or raw SQL. Migration/seed errors are also redacted.
- Render blocks external database access; local PostgreSQL binds to loopback. Checkout defaults off. Enable only with private Sandbox credentials and exact HTTPS (or localhost HTTP) origin configuration.
- Headers deny framing/object embedding and enable MIME sniffing protection, permissions and referrer policies. This is a baseline, not a complete production CSP or independent security audit.
- Future financial/merchant actions need separate operator authorization. Persistent rate limits and paid-resource budgets must be implemented **before** exposing those endpoints; they are not claimed as implemented now.

### Implemented checkout safeguards (actual Sandbox happy path verified; not production certification)

- 256-bit HttpOnly/SameSite=Lax browser cookie; Secure on HTTPS. Only SHA-256 token digests are stored. A checkout UUID/return token is not authorization.
- Exact Origin checks, JSON-only 2 KiB request bodies, UUID/product allowlists; no visitor-supplied amount/currency/merchant parameters.
- PostgreSQL counters: 3 new orders/session/hour, 10 globally/hour, 30 globally/day. Provider operations additionally have per-order/global hourly/daily limits. No IP addresses are retained.
- Persisted create/capture UUIDs, a two-hour create deadline and durable concurrent-operation leases. Capture intent is saved before dispatch; ambiguous captures only reconcile. An operator must investigate unresolved attempts, not reset their markers or invent completion.
- The same-origin, cookie-bound `reconcile` action requires an already-attempted payment, accepts no visitor capture ID and cannot create/capture at PayPal. Existing capture identity is pinned from validated order evidence and independently retrieved through Payments v2. Expiry does not disable attempted-capture reconciliation. Status observations alone do not authorize a verified Twin; pending, failed, declined, mismatched or incomplete evidence cannot fabricate completion.
- Retrieve and validate both order and capture: status, amount/currency, merchant, item SKU/quantity, application references, final-capture flag and timestamps. Atomic Twin/document/event insertion and unique provider references prevent duplicate records.
- Original product/policy/callback/payee context is snapshotted. Raw SDK payload logging is not enabled; sanitized error status/debug IDs are the only provider diagnostics.
- An optional immediate-test scope is server-only: one request UUID/session digest, fixed SKU/USD 129.00 price and an initially false balance-confirmation flag. New creation is blocked before insertion/provider calls while unconfirmed and rejected for a different scope. Neither the browser nor a URL can set funding preference or confirmation. The preference is persisted only on the new order; old nulls preserve original SDK bodies and financial keys. Balance selection remains a buyer-confirmed PayPal UI step, never payment proof.
- No runtime mock-provider or arbitrary provider-base-URL switch. Tests inject doubles into the service or intercept browser transport only. Production SDK environment is hardcoded Sandbox.
- Webhooks are absent; signature verification/delivery has not been tested. See `docs/PAYPAL.md` before claiming live integration.
- `docs/PAYPAL-WEBHOOKS.md` assesses a future public-HTTPS listener, verification, inbox and retry/deduplication boundary. It adds no current webhook route or delivery claim.

## Required safeguards

### Stage 3 CareOS boundary (implemented, no live inference claim)

CareOS adds bounded conversation writes, not purchase/merchant authority. A separate 256-bit HttpOnly capability (digest only in PostgreSQL), exact Origin, strict 16 KiB JSON/2,000-character message schemas, session/global quotas, single-turn leases and persisted request fingerprints protect its endpoints. Public visitors cannot supply trusted history, tools, identities, provider URLs, prices or payment actions. Responses and transcript reads are private/no-store. Knowledge is product/brand/model filtered, hash-checked and treated as untrusted text.

The Responses adapter has no tools, automatic retries, arbitrary URLs or financial privileges. Strict output, allowlisted source/quote checks and escaped components constrain output; none eliminates prompt injection or proves truth. Runtime activation requires a separately configured restricted CareOS DB role, explicitly approved API credentials/budgets and atomic pre-dispatch reservations. Unknown calls retain their charge reservation. Clear never resets budgets. `store:false` is not a zero-retention guarantee. Expired conversations are inaccessible after 24 hours; operator `careos:cleanup` removes expired content physically. See [operational limits and remaining risks](CAREOS.md).

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

Discovery preflight checks both `current_user` and `session_user`, including column-level writes: authenticating as an evidence-capable owner and merely using `SET ROLE` is not accepted as least privilege. Dedicated-test-DB verification uses an actual temporary restricted login (random runtime-only credential, revoked/dropped afterward) and explicitly rejects the narrowed-owner session. This creates no application or external-provider account.

Pal Care does not independently underwrite warranties, issue insurance, decide PayPal Purchase Protection eligibility, or guarantee merchant price-match terms.
