# Technical architecture

## Approach

**Modular monolith** using Next.js App Router. Client and server share one repository with typed domain modules. A worker invokes the same domain services through durable database-backed jobs. This minimizes complexity for a solo builder.

```text
Consumer app                   Merchant console + AG Studio
      |                                   |
      +----------- Next.js API -----------+
                         |
             Purchase Twin service
                         |
               CareOS event engine
                 /       |        \
           AI advisor  Policy    Payments
                 |       |          |
                 +-- Supabase DB   PayPal Sandbox
                       |
               Private document store
                       |
              Jobs: CPSC / Channel3
```

## Domain services

- **Identity:** users, purchase ownership and merchant permissions.
- **Commerce:** trusted catalog SKUs, PayPal orders, captures and refunds.
- **Purchase Twin:** item-level identifiers, order link, policy versions, document references, event history and verified outcomes.
- **Care events:** typed price changes, recall candidates and dates; each with provenance, timestamp and deduplication key.
- **Opportunities:** eligibility decision, evidence, expiration and next action.
- **Approval:** merchant actor, case ID, exact approved currency/amount and timestamp.
- **Payment operations:** persistent idempotency key, provider IDs, attempt status and reconciliation.
- **Care knowledge:** approved source passages from manuals, merchant policies and official notices.

## Proposed database tables

`profiles`, `merchant_members`, `merchants`, `products`, `merchant_prices`, `orders`, `order_items`, `purchase_twins`, `documents`, `policy_versions`, `care_events`, `opportunities`, `approval_decisions`, `refund_operations`, `background_jobs`.

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

AI may interpret product data, explain policy, retrieve manual passages and propose recall candidate matches. It never authorizes or executes unrestricted financial actions. Every consequential decision must be checked with deterministic code. Uploaded documents and external pages are untrusted data and must not override system rules.

## Recall candidates

Use product identifiers and official CPSC data. Keep candidate, confirmed and unconfirmed identity states distinct. Product-name resemblance alone is not confirmation of a recall.

## Operations

Durable jobs with bounded retries, provider timeouts, deduplication, secure logs and manual investigation for irrecoverable or ambiguous states. See [Security Design](SECURITY.md) and [ADR 0001](adr/0001-modular-monolith.md).
