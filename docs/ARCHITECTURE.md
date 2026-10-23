# Technical architecture

## Approach

Stage 4 adds `src/lib/price-guardian` deterministic policy/detection/projections, `src/lib/operator` private capabilities, separate refund contracts/service/verification and eleven additive tables in `src/db/guardian-schema.ts` (23 total). Background CLI jobs share services and never auto-dispatch refunds. Original financial evidence remains unchanged; aftercare lifecycle verification is separate from first-capture verification. Public analytics is read-only; future AG Studio is not implemented. Financial activation and actual Sandbox acceptance remain pending. [ADR 0007](adr/0007-price-guardian.md) · [contract](PRICE-GUARDIAN.md). Earlier stage descriptions below are historical where superseded.

**Modular monolith** using Next.js 16 App Router, React, TypeScript and Drizzle on Render Managed PostgreSQL. Both dashboards are public demo views with one fixed fictional customer and merchant. No Supabase, customer registration, login, personal uploads or real-money payments are included. [ADR 0002](adr/0002-public-render-demo.md) supersedes the initial infrastructure/auth proposal.

Stage 1 and the bounded Stage 2 Sandbox purchase/Twin flow are implemented and locally verified. A separately authorized USD 129.00 immediate-payment purchase has matching actual completed Orders/Payments evidence and exactly one durable Twin/receipt/policy/event; two read-only verifier runs preserved all records. The earlier eCheck remains separately pending/unverified locally and unchanged by that verification. Stage 3 adds CareOS fixture assistance and a gated runtime adapter while retaining the premium identity and financial logic. Actual hosted inference, refunds, sponsors, workers and webhooks remain incomplete. See [payment evidence](evidence/STAGE2-VERIFICATION.md), [ADR 0003](adr/0003-sandbox-checkout.md) and [CareOS](CAREOS.md).

## Frontend appearance

The original Blue & Lavender identity uses semantic CSS tokens for dedicated light/dark palettes, original theme-aware SVGs and reusable passport/card/status components. Geist Sans is self-hosted from the maintained `geist` package. `next-themes` wraps the root once, defaults to System and stores only appearance preference under `palcare-appearance`. The accessible selector and browser/native color-scheme synchronization do not call an API or remount checkout controls. Mobile/tablet navigation uses four bottom destinations; desktop retains a sidebar. See [ADR 0004](adr/0004-premium-appearance.md) and [Design system](DESIGN.md).

## Implemented foundation

- `src/db/schema.ts` defines `demo_customers`, `merchants`, `products`, `purchase_twins`, `documents` and `care_events`.
- `drizzle/` is the authoritative migration history. Drizzle Kit generates reviewed SQL; no schema-push or second migration system.
- `scripts/migrate.ts` applies migrations; `scripts/seed.ts` creates deterministic fictional records with transactional `ON CONFLICT DO NOTHING`. Reruns do not overwrite existing data.
- `src/lib/demo/repository.ts` is server-only. Runtime sessions default to read-only; queries use repeatable-read, read-only transactions. The connection pool and timeouts are bounded.
- Queries use fixed server-side demo IDs and join-derived document/event scopes, not visitor-supplied customer or merchant IDs. `findTwin` validates IDs and product/merchant association.
- Public purchase reads are bounded to the 100 newest Twins; counts/search describe that current demo window, not lifetime commerce metrics.
- `DEMO_DATA_SOURCE=fixtures` is a labeled, account-free preview. `database` reads PostgreSQL sample records. Configuration or database failures never silently trigger fixture fallback.
- Stage 1 sample constraints are extended by migration 0001. Sandbox Twins require checkout evidence references, a snapshot and verification time; unique keys prevent duplicate Twins for one capture. Existing sample rows remain sample-only.
- Original sample text documents are stored in PostgreSQL and returned as attachments. No object-storage service, private upload or real manufacturer content is claimed.
- Purchase records remain read-only. Stage 2 adds bounded session-authorized Sandbox checkout; Stage 3 adds separately scoped CareOS conversation writes only. No refunds, merchant approvals, catalog-edit or seed endpoints exist. Migration/seed commands remain operator CLI tasks.
- `/api/health` checks process liveness; `/api/ready` verifies the selected data source and seed presence. Render uses readiness.

## Stage 2 checkout boundary

`src/lib/commerce/` contains pure schemas/security/verification, the official Sandbox SDK adapter, a testable service and a server-only runtime. `checkout_orders` stores immutable request/product/policy context, separate create/capture idempotency keys, hashed anonymous ownership, state, leases, selected provider references and attempted/verified timestamps. `checkout_rate_limits` enforces persistent budgets.

`POST /api/checkout/orders` validates a product UUID/request UUID, loads trusted catalog prices and snapshots a one-item USD order before contacting PayPal. The browser receives a random HttpOnly checkout cookie; provider credentials never reach it. Buyer approval happens through the sandbox HATEOAS redirect URL. On return, a same-origin POST retrieves and validates the order before capture; capture is requested at most once, then Orders v2 and Payments v2 retrieval establish completion. GET callbacks/query parameters alone cannot create a Twin.

Provider calls happen outside DB transactions, guarded by durable leases. Completion inserts order evidence, Twin, receipt, demo policy and purchase event in one transaction. `capture_attempted_at` persists before dispatch; later requests reconcile an ambiguous outcome rather than resubmitting capture. No webhook endpoint is implemented. Full operational limits and failure tradeoffs are in [ADR 0003](adr/0003-sandbox-checkout.md) and [PayPal setup](PAYPAL.md).

`POST /api/checkout/orders/:uuid/reconcile` is read-only at PayPal and cannot start capture. It preserves the attempted-capture marker and deadline, validates Orders v2 relationships, pins the existing capture ID and independently retrieves that ID through Payments v2. Migrations 0003/0004 separate observed capture identity/status/reason/check-time from the original completed-payment evidence reference, preserving the Twin foreign-key boundary. Pending stays unverified; failed/declined captures produce terminal failure; both providers must supply matching completed capture evidence before exactly-once local finalization. Retries and concurrent browser checks reuse leases, quotas and unique references. Future webhooks must reuse this retrieval-only reconciliation path after separate signature verification and durable deduplication; see [assessment, not implementation](PAYPAL-WEBHOOKS.md).

The single immediate-payment experiment is operator-scoped to one request/session, fixed USD 129.00 headphones SKU and explicit balance confirmation. Migration 0005 adds a nullable per-order preference; legacy nulls omit the field from the SDK body. The new preference is persisted before dispatch and reused from the saved record on retries, never inferred from current configuration. Request uniqueness prevents a second checkout, and existing status/reconciliation paths are unchanged. The merchant preference is not proof of balance funding or settlement. See [ADR 0005](adr/0005-single-immediate-sandbox-test.md).

```text
Public customer demo           Public merchant demo (+ AG Studio later)
      |                                   |
      +----------- Next.js API -----------+
                         |
             Purchase Twin service
                         |
               CareOS event engine
                 /       |        \
           AI advisor  Policy    Payments
                 |       |          |
                 +-- Render PG     PayPal Sandbox (later)
                       |
               Sample text documents (private files later)
                       |
              Jobs: CPSC / Channel3
```

## Domain services

The following is the **target architecture**, not a list of shipped services.

- **Demo identity and permissions:** fixed fictional records for public reading; future operator authorization for consequential actions (no customer login in this MVP).
- **Commerce:** trusted catalog SKUs, PayPal orders, captures and refunds.
- **Purchase Twin:** item-level identifiers, order link, policy versions, document references, event history and verified outcomes.
- **Care events:** typed price changes, recall candidates and dates; each with provenance, timestamp and deduplication key.
- **Opportunities:** eligibility decision, evidence, expiration and next action.
- **Approval:** merchant actor, case ID, exact approved currency/amount and timestamp.
- **Payment operations:** persistent idempotency key, provider IDs, attempt status and reconciliation.
- **Care knowledge:** approved source passages from manuals, merchant policies and official notices.

## Future database tables

Extend Stage 1 tables with `merchant_prices`, `orders`, `order_items`, `policy_versions`, `opportunities`, `approval_decisions`, `refund_operations` and `background_jobs`. Operator authorization is separate from dashboard visibility; do not reintroduce customer accounts without an explicit architecture decision.

Store amounts as integer minor currency units, with a separate ISO currency code. Use transactional reservations/locking for concurrent refunds, and unique indexes for external capture/refund/event IDs.

## Verified purchase lifecycle

1. Calculate the order total server-side from trusted merchant records.
2. Create a PayPal sandbox order and persist the operation.
3. The buyer approves through PayPal's sandbox experience.
4. Capture payment and verify its amount/currency and provider state.
5. Transactionally create/reconcile Purchase Twins for each purchased item.
6. Attach available receipt and manufacturer documents; never invent documents that were not supplied.
7. Record the `order.captured` event.

## Price adjustment lifecycle

1. Save a merchant catalog price change with timestamp and source.
2. Evaluate the customer's captured purchase against the applicable snapshotted merchant policy.
3. AI explains evidence but cannot decide the refund amount or override the policy.
4. An authorized merchant user approves the exact adjustment.
5. Atomically reserve refundable funds and persist an idempotency key **before** the provider request.
6. Issue PayPal's permitted partial refund, reconcile status via provider response/retrieval and verified webhooks.
7. Do not issue a second refund when the original result is ambiguous. Keep it pending until reconciled.

## AI and trust boundaries

### Stage 3 implementation

CareOS now has one persistent root-layout host, deterministic dashboard briefings/direct document actions, inline document views and product-care pages. `src/lib/careos/` owns contracts, context-bound read tools, lexical/tag retrieval, evidence validation, providers and conversation/budget stores. PostgreSQL tables in `src/db/careos-schema.ts` are additive migrations 0006/0007; the original financial schema/service is unchanged.

`fixture` is the default and visibly labeled; the official Responses adapter is implemented but no hosted inference is claimed. Paid inference requires an explicit enable flag, separate API credentials, reviewed model/endpoint, a restricted writer and atomic persistent budget reservations. No AI tool can call commerce. Conversation state is application-controlled and cookie-scoped, not provider-hosted memory. Source text/history remains untrusted; quote/schema checks are not proof of semantic grounding. See [full contract](CAREOS.md) and [ADR 0006](adr/0006-careos-assistant.md).

AI may interpret product data, explain policy, retrieve manual passages and propose recall candidate matches. It never authorizes or executes unrestricted financial actions. Every consequential decision must be checked with deterministic code. Uploaded documents and external pages are untrusted data and must not override system rules.

## Recall candidates

Use product identifiers and official CPSC data. Keep candidate, confirmed and unconfirmed identity states distinct. Product-name resemblance alone is not confirmation of a recall.

## Operations

Durable jobs with bounded retries, provider timeouts, deduplication, secure logs and manual investigation for irrecoverable or ambiguous states. See [Security Design](SECURITY.md) and [ADR 0001](adr/0001-modular-monolith.md).
