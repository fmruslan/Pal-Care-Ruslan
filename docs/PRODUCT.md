# Product vision and scope

## North star

**Stage 4:** proactive Price Guardian and protected merchant approval are implemented with financial activation off. The future-only inactive `demo-price-v2` promise covers the exact SKU for 14 days, one adjustment/capture, up to $20. Customers never initiate claims. Actual new purchase/refund and unknown-ID recovery acceptance require separate approval. Existing `demo-v1` purchases are never retroactively eligible. [Contract](PRICE-GUARDIAN.md).

**Pal Care makes the purchase the beginning of a useful care relationship.** A verified PayPal sandbox order creates a Purchase Twin, connecting product identity, trusted documents, applicable terms, and meaningful after-purchase events.

## Who it serves

- **Customers** who want reliable records, timely care information, and eligible savings.
- **Participating merchants** who want to provide aftercare and resolve legitimate adjustments under their own policies.

## Hackathon access model

Both dashboards are public using one fixed fictional customer and merchant. No registration, login or real customer information is collected. Sample records remain explicitly labeled. Bounded anonymous Sandbox checkout has historical actual completed-capture/Twin acceptance evidence; the separate pending eCheck remains unverified and is not relabeled. Fixed merchant price/policy/approval actions have separate private operator capabilities; actual refund execution remains disabled pending independent acceptance. Stage 5 unifies read-only activity and product-aware journeys without expanding financial authority. See [status](STATUS.md), [evidence](evidence/STAGE2-VERIFICATION.md), [ADR 0002](adr/0002-public-render-demo.md) and [ADR 0003](adr/0003-sandbox-checkout.md).

## Five capability areas (see STATUS for implemented versus planned behavior)

1. **Purchase Vault:** Verified orders, receipt records, warranty documents, merchant information, and supported manuals.
2. **Price Guardian:** Price-change monitoring and merchant-approved adjustments subject to recorded policy.
3. **Purchase Protection:** Official CPSC recall candidates, merchant return dates, and warranty information.
4. **Product Care:** Source-grounded setup, maintenance, and repair guidance.
5. **Replacement Concierge:** Real product discovery via Channel3, not fictional merchandise.

## Purchase Twin

A durable item-level data record linking product identifiers, order references, policy versions, documents, relevant events, and verified outcomes. It is **not** a separate language model permanently running for each purchase.

## Proof the hackathon submission should provide

PayPal sandbox capture → stored Purchase Twin → controlled merchant price update → deterministic eligibility → merchant approval → actual PayPal partial refund → authoritative verified refund status.

Use a separate historical item for a real official recall source; optional alternatives through Channel3.

## Explicit non-goals

No barcode scanning; no universal access to PayPal consumer history; no general-purpose claims platform; no subscription manager; no automated external retailer checkout; no guaranteed refunds, warranty extension, or insurance; no simulated events presented as live external changes.

## Service principles

### CareOS interaction principle: assistant-first, not chat-first

- **Glance:** one or two factual, dismissible suggestions from saved records. No invented price monitoring, coverage or recalls.
- **Tap:** direct receipt/document/guide/history navigation. Conversation is optional.
- **Talk:** one persistent customer assistant, always explicit about the selected Purchase Twin and execution mode. Switching products must not mix receipts or care evidence.

These interactions have explicit fixture mode plus actual owner-only Sol Medium subscription acceptance; population accuracy, independent user research and public/API acceptance remain separate. One Raspberry Pi 5 reference sample has licensed exact-model guidance. Forma F-01 has no manufacturer manual. Reference ownership is not verified payment, and its zero placeholder is not a market price. [Actual quality evidence](evidence/SUBSCRIPTION-QUALITY.md) · [CareOS](CAREOS.md) · [sources](CARE-SOURCES.md).

- Minimize customer effort. Integrating a merchant should automatically create the Purchase Twin.
- Ground consequential explanations in a stored policy or original official source.
- Show distinct states: identified, eligible, awaiting approval, submitted, processing, completed, and failed.
- Present keep/repair options before pushing replacement shopping when appropriate.
- Require properly authorized merchant approval for financial actions.

## Business hypothesis

Useful aftercare might increase consumer preference for PayPal and improve merchant support efficiency. This is a hypothesis to validate with user research, not a measured impact claim.
