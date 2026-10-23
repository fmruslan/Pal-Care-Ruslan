# Price Guardian — Stage 4 contract

**Implemented locally; actual Sandbox refund/recovery acceptance is not yet authorized or verified.** Implementation tests make no actual purchase/refund, paid inference, cloud worker or deployment. AG Studio is connected for local read-only evaluation with scripted tools, not live inference/public licensing. See [status](STATUS.md), [Stage 4 evidence](evidence/STAGE4-VERIFICATION.md) and [Stage 5 hardening](evidence/STAGE5-VERIFICATION.md).

## Effortless customer experience

CareOS discovers opportunities from saved purchase facts and recorded merchant catalog prices. The customer does not submit a claim. The dashboard briefing prioritizes discovered adjustments; `/guardian` and `/guardian/:uuid` explain calculation, provenance, merchant approval and provider evidence. The original Purchase Twin gains an adjustment card and durable event history. Original receipts and purchase evidence never change. A verified adjustment can show an effective cost separately.

When no covered purchase exists, the page says so. Its expandable `$129 → $109 → $20` illustration is explicitly fictional, not an entitlement, transaction or verified refund. Existing `demo-v1` purchases—including the completed Stage 2 purchase—are not covered retroactively. CareOS may explain saved status; it cannot publish prices, approve or execute refunds.

## Deterministic merchant promise

`demo-price-v2` is an immutable, hashed merchant policy for the exact Everyday Goods Forma F-01 SKU/variant, USD, quantity one, full-priced purchases. The lower recorded price must follow capture and fall strictly before capture plus 14 × 24 hours. Initial dispatch must also precede that deadline. One adjustment per capture, maximum USD 20.00. No coupons, membership, bundles, other sellers, shipping or taxes; the current single-item checkout does not support these.

Seed inserts only an **inactive draft**, never approval. Private operator approval activates the version for future checkout. Checkout additionally requires `PRICE_GUARDIAN_CHECKOUT_ENABLED=true` and an `offerHash` matching the current product/price/policy shown to the buyer. Binding occurs only inside insertion of a new checkout. Historical retries return their original policy without rebinding. Stale/missing offers fail rather than silently changing terms. Policy activation does not enable financial execution.

`pnpm guardian:job` compares the fixed server-owned catalog with its last observation and runs bounded deterministic detection: up to ten batches of fifty policy-bound purchases, persistent cursor, advisory lock, unique case/capture, append-only events. Price observations record source and server timestamp; they are not PayPal-verified prices. Only actual drops qualify; an unchanged or already-low initial catalog observation does not create a false opportunity. Price changes invalidate old revisions/approvals before dispatch. Scheduled continuous monitoring is **not deployed**.

## Protected merchant actions

Public dashboards and APIs are read-only. `/merchant/operator` requires a private one-use 256-bit activation code issued by CLI. Only its hash is stored. Activation creates a separate HttpOnly SameSite cookie; grants expire in at most eight hours (CLI issues one hour), browser sessions in one hour. Revocation is checked server-side on each action. Case/refund actions require an exact case UUID; catalog actions have separate permissions. Codes never belong in URLs, logs, screenshots or Git.

```bash
# Private operator terminal only; these issue capabilities, not refunds.
pnpm operator issue catalog policy:publish,price:publish
pnpm operator issue CASE_UUID case:approve
pnpm operator revoke GRANT_UUID
```

Do not issue/activate financial capabilities until separately authorized. Approval binds case revision, amount, currency, policy hash, price-event ID, actor and expiry (at most 15 minutes). It is not submission or completion. Mutation endpoints enforce exact Origin, JSON ≤2 KiB, strict allowlists and persistent limits. Activation attempts are globally bounded (100/hour); authorized nonfinancial actions are limited to 30/grant/hour and 100/hour globally.

`GUARDIAN_OPERATIONS_ENABLED` defaults false. `scripts/guardian-role.sql` is a reviewed role template, not an executed deployment: configure login/credentials privately. It grants no writes to checkout/Twin/document evidence or policy bindings, no grant issuance, and no deletes. Provider-access runtime requires a separate `GUARDIAN_DATABASE_URL` and rejects evidence-capable writers before provider access. Never use the CareOS writer or expose credentials client-side.

Stage 5 applies shared login/effective/assumable-role and positive/negative grant checks to operator runtime and private catalog jobs, even when provider reads are off. No Guardian job falls back to the general reader/owner URL. Private grant issuance/revocation uses a separate **`OPERATOR_DATABASE_URL`**, never supplied to the web service; a runtime Guardian login cannot issue grants. Current migrations through 0015 must be separately approved/applied, and actual environment credentials remain unverified until provisioning passes.

## Refund safety and state machine

The pinned official PayPal SDK 2.5.0 uses Sandbox only, transport retries disabled. A partial-refund body always includes an exact integer-minor USD amount, stable `customId`, `invoiceId` and `PayPal-Request-Id`. There is no visitor-supplied capture/refund ID or arbitrary amount.

Execution needs **all** of: enabled operations, explicit `GUARDIAN_REFUNDS_ENABLED=true`, `GUARDIAN_PROVIDER_READS_ENABLED=true`, database mode, Sandbox credentials/payee, restricted writer, exact configured case/capture, nonempty experiment ID, scoped operator capability and fresh merchant approval. The experiment reserves at most $20 permanently; first-release dispatch is additionally limited to one/day. Provider operations are limited to 20/case/hour, 120/hour globally and 300/day. Limits are persistent, not browser memory.

1. Acquire a durable three-minute case lease; retrieve original Orders and capture independently. First dispatch requires `COMPLETED`, exact original evidence and no observed prior refunds.
2. Recheck approval, deadline, current catalog/event, revision and scope in a transaction. Persist immutable intent/payload hash/key, unique capture reservation and attempted marker **before** POST.
3. Dispatch at most once. A saved operation blocks every later POST, even after failure, expiry, crash or unknown outcome. **No automatic POST replay**, even with the same idempotency key.
4. A POST response is not success proof. Retrieve order/capture again and independently GET the pinned refund; validate exact ID, amount/currency, capture-parent Sandbox link, timestamp and any supplied correlation/merchant fields. Completed refund plus matching `PARTIALLY_REFUNDED` lifecycle is required for local completion. Contradictions stay in review/unresolved.
5. Atomically update the operation/case and deduplicated completion event. Original checkout, capture, receipt and policy snapshot remain untouched. First-capture verification still rejects refunded capture statuses; a separate aftercare verifier handles historical lifecycle.

States distinguish awaiting approval, approved/not submitted, submitting, unknown, provider pending, verified completed, failed, cancelled, expired and review. Unknown/pending/review reserve the amount and block another refund. Reconciliation after dispatch remains valid beyond the original price-promise deadline and **only retrieves** provider resources. The job can reconcile the one configured existing operation; it can never dispatch a refund. No webhook exists.

### Unknown refund ID: unproven external assumption

Orders v2 declares optional refund records; it does not guarantee their presence in every retrieval. Recovery accepts **exactly one** entry with both saved `customId` and `invoiceId`, then requires independent refund GET and capture-parent validation. Absent collection, missing correlation, duplicate candidates, wrong parent, retrieval failure or inconsistent lifecycle never prove completion and never authorize another POST.

`pnpm guardian:verify CASE_UUID` is a read-only actual-provider verifier prepared for the **separately approved** experiment. It retrieves the known refund, order and capture, reports whether the optional Orders collection/correlation actually permits recovery, and performs zero local/provider mutations. It has not been run. If optional fields are absent, report recovery unsupported for that observed response; retain blocked state. Do not deliberately hide IDs in the application DB, rotate keys or issue another refund to manufacture recovery evidence.

**First-release limitation:** absent optional refund arrays cannot prove absence of an external pending refund. Use only a new isolated controlled capture, no concurrent manual/other-system refunds; any observed prior refund blocks. PayPal's provider amount enforcement remains the final ceiling. This is not a production multi-actor remaining-balance ledger or a guarantee that external activity can always be detected.

## Read-only AG Studio foundation

`GET /api/guardian/analytics` returns version `guardian-analytics-v1`, USD integer minor units, all-case totals and the 500 newest facts. Fixed fictional customer/merchant scope; no credentials, payer identity, raw provider bodies or mutation authority. Facts include state, revision, reasons, policy version, original/compared/adjustment amounts, price origin, detection/approval/attempt/check/verification timestamps and evidence links.

Separate metrics: opportunities; proposed; approved/not submitted; provider-pending; unresolved/reserved; verified-refunded amount/count; failed/cancelled count. Aggregates query cases/operations, not event counts, so retries do not inflate totals. Verified amounts require independent completed evidence. Historical opportunity count includes expired/failed cases; it is not the number of currently claimable benefits. The facts window is bounded, totals are not. Scheduling status reports configuration and last successful check, not a guarantee of freshness. No agent widgets or AG Studio integration are claimed.

## Local verification and future activation

Run `pnpm check`, `pnpm format:check`, `pnpm test:integration`, `pnpm test:failure`, both normal browser modes and `pnpm test:guardian:e2e`. Integration and exclusive browser tests require explicit local `TEST_DATABASE_URL` ending `_test`. **Never overlap** the exclusive Guardian suite with any other test-DB suite: it creates and removes synthetic financial evidence in that database only. CI runs them serially and has no PayPal/model credentials. Browser financial/provider flags are forced off; only Node-side injected gateways simulate financial outcomes.

For existing local application records: `pnpm exec tsx scripts/verify-guardian-upgrade.ts --apply` checks every row across all twelve existing tables before/after reviewed migrations and inactive seed. Never schema-push/reset. This command does not publish policy, change prices, issue grants or call providers.

Optional future cron: after cost/deployment approval, schedule `pnpm guardian:job` with a least-privilege secret environment, one active invocation and failure alerts. Leave the scheduled flag false until a real schedule is configured and verified. Do not add a public cron/refund route or deploy paid resources now.

After automated acceptance and exact-SHA CI, request separate permission for **one new USD 129.00 Sandbox purchase and one USD 20.00 refund**, plus read-only verification/reconciliation of that experiment. Reserve a new request/session scope only after that permission and buyer balance confirmation; do not reuse/rotate the consumed Stage 2 experiment or touch the pending eCheck. Activate the v2 policy before the new checkout; drop to $109 only after independently completed capture. Fresh scoped merchant approval then permits one refund POST. If any result is uncertain, stop and retrieve; never create another purchase/refund to bypass failure. Disable flags after the controlled test. Hosted AI, sponsors, public deployment and webhook delivery require separate work.

## Official references

- [Payments v2 schema](https://developer.paypal.com/api/payments/v2/schema.json)
- [Orders v2 schema](https://developer.paypal.com/api/orders/v2/schema.json)
- [REST idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)

The installed SDK documents refund key retention, but this implementation does not rely on indefinite retention or replay ambiguous POSTs. Optional API fields remain optional; mocked payloads are not actual Sandbox evidence.
