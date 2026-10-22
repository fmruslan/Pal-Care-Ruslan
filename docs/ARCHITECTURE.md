# Technical architecture

## Approach

**Modular monolith** using Next.js 16 App Router, React, TypeScript and Drizzle on Render Managed PostgreSQL. Both dashboards are public demo views with one fixed fictional customer and merchant. No Supabase, customer registration, login, personal uploads or real-money payments are included. [ADR 0002](adr/0002-public-render-demo.md) supersedes the initial infrastructure/auth proposal.

Stage 1 is implemented; payment, AI, sponsor and worker services below remain planned. A future worker will invoke the same domain services through durable database-backed jobs.

## Implemented foundation

- `src/db/schema.ts` defines `demo_customers`, `merchants`, `products`, `purchase_twins`, `documents` and `care_events`.
- `drizzle/` is the authoritative migration history. Drizzle Kit generates reviewed SQL; no schema-push or second migration system.
- `scripts/migrate.ts` applies migrations; `scripts/seed.ts` creates deterministic fictional records with transactional `ON CONFLICT DO NOTHING`. Reruns do not overwrite existing data.
- `src/lib/demo/repository.ts` is server-only. Runtime sessions default to read-only; queries use repeatable-read, read-only transactions. The connection pool and timeouts are bounded.
- Queries use fixed server-side demo IDs and join-derived document/event scopes, not visitor-supplied customer or merchant IDs. `findTwin` validates IDs and product/merchant association.
- `DEMO_DATA_SOURCE=fixtures` is a labeled, account-free preview. `database` reads PostgreSQL sample records. Configuration or database failures never silently trigger fixture fallback.
- Twins, events and documents have database-enforced `origin='sample'` in Stage 1. No provider references or verified-payment state exist. Stage 2 must migrate the schema before adding sandbox records.
- Original sample text documents are stored in PostgreSQL and returned as attachments. No object-storage service, private upload or real manufacturer content is claimed.
- Only read endpoints exist. There are no checkout, refund, approval, catalog-edit, AI or seed endpoints. Migration/seed commands are operator CLI tasks.
- `/api/health` checks process liveness; `/api/ready` verifies the selected data source and seed presence. Render uses readiness.

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

AI may interpret product data, explain policy, retrieve manual passages and propose recall candidate matches. It never authorizes or executes unrestricted financial actions. Every consequential decision must be checked with deterministic code. Uploaded documents and external pages are untrusted data and must not override system rules.

## Recall candidates

Use product identifiers and official CPSC data. Keep candidate, confirmed and unconfirmed identity states distinct. Product-name resemblance alone is not confirmation of a recall.

## Operations

Durable jobs with bounded retries, provider timeouts, deduplication, secure logs and manual investigation for irrecoverable or ambiguous states. See [Security Design](SECURITY.md) and [ADR 0001](adr/0001-modular-monolith.md).
