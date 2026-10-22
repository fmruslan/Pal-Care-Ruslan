# ADR 0003: Bounded anonymous PayPal Sandbox checkout

**Status:** Accepted and implemented; bounded Stage 2 Sandbox purchase/Twin acceptance passed on 2026-10-22. The separately authorized immediate-payment case has matching actual completed capture evidence and exactly-one durable Twin/receipt/policy/event; two read-only verifier runs preserved all records. The prior eCheck remains separately preserved and is not claimed cleared. Checkout expiry/operational verification are separate from the approved redesign. [Evidence](../evidence/STAGE2-VERIFICATION.md).
**Date:** 2026-10-21

## Decision

Use the exact-pinned official `@paypal/paypal-server-sdk` 2.5.0, Orders v2 create/get/capture and Payments v2 capture retrieval. Use PayPal's returned sandbox approval URL for a redirect flow. A browser SDK is not required for this supported flow, keeping even the client ID server-side. The SDK's client manages OAuth tokens; API retries are disabled in the transport so our durable state controls recovery.

No customer registration. Only an explicitly enabled deployment with database mode, a trusted application origin, sandbox credentials and expected sandbox merchant ID can transact. Production PayPal is not selectable. One fixed fictional merchant/customer, one allowlisted product and quantity one per order, USD 0.01–200.00, no shipping, no real goods.

## Authorization and limits

The browser receives a cryptographically random 256-bit HttpOnly/SameSite=Lax cookie (Secure on HTTPS). PostgreSQL stores only its SHA-256 digest. Read/mutate checkout operations require the originating cookie; a local order UUID or PayPal return query alone conveys no authority. Capture/reconcile/cancel/retry are same-origin JSON POSTs with a 2 KiB body limit. GET never captures or calls PayPal.

Persistent database counters bound creation to 3/session/hour, 10 globally/hour and 30 globally/day. Provider-operation leases are bounded to 20/order/hour, 120 globally/hour and 300 globally/day. Each lease may make up to four SDK API calls, plus SDK token refresh when needed. Rotating sessions cannot bypass global limits. No IP addresses or customer identity are stored. No merchant-edit or refund endpoints exist.

## Integrity and recovery

- Snapshot product identity, amount, currency, merchant name, intended PayPal payee ID, callback origin and demo policy before creating the provider order.
- Persist separate UUID idempotency keys for create and capture; exact snapshot reuse on create retries. A two-hour creation deadline is shorter than PayPal's documented six-hour key retention.
- Client request IDs are globally unique as well as session-bound. Reusing an initial request after losing its cookie is rejected rather than creating another provider order.
- Claim a durable two-minute lease; perform network requests outside database transactions. Concurrent callers cannot capture twice.
- Persist `capture_attempted_at` **before** issuing capture. Later status checks retrieve/reconcile only if capture was attempted. A crash between persisting the marker and dispatching the request can leave an order pending; this conservative tradeoff requires operator review rather than risking duplicate capture.
- Validate retrieved order intent, IDs, references, invoice, payee, item SKU/quantity, USD total and unit amount. A completed order without a completed final capture is not proof of payment. Independently retrieve and cross-check the capture through Payments v2.
- Reconciliation-only operations cannot start a payment, even through an unattempted or forged return. They pin the Orders-validated capture ID, query that same ID through Payments v2, and record bounded status observations (migrations 0003/0004). The observed identity is separate from the original completed-payment reference, so pending cannot satisfy a verified Twin's foreign key. The identity, attempt marker, request keys and deadline remain stable. Pending is not completed proof; failed/declined capture creates no verified Twin. Completed finalization requires agreement from both retrieved sources, including capture ID/amount/currency/time, and the locked row's pinned identity. Browser retries/concurrent checks converge on one Twin/receipt/policy/event.
- Atomically store completed local order evidence, unique sandbox Twin, sandbox receipt, demo policy and care event. Sample rows cannot acquire sandbox provenance without non-null provider references and a matching checkout evidence foreign key.
- Do not persist raw provider bodies: they may contain sandbox payer names/emails/addresses. Store only selected transaction references and product/policy snapshots. Application logs allow only sanitized provider status/debug IDs.

## Boundaries

No refunds, AI, Price Guardian, sponsor integration, webhooks, customer accounts or real money. Existing sample receipts/cards remain labeled sample; no manufacturer manual or warranty is fabricated. Public dashboards show sample and verified-sandbox records separately. Local test doubles and intercepted browser responses are test evidence only, not live PayPal verification.

The [webhook assessment](../PAYPAL-WEBHOOKS.md) is future deployment/security work, not a registered listener or verified delivery.
