# Product vision and scope

## North star

**Pal Care makes the purchase the beginning of a useful care relationship.** A verified PayPal sandbox order creates a Purchase Twin, connecting product identity, trusted documents, applicable terms, and meaningful after-purchase events.

## Who it serves

- **Customers** who want reliable records, timely care information, and eligible savings.
- **Participating merchants** who want to provide aftercare and resolve legitimate adjustments under their own policies.

## Hackathon access model

Both dashboards are public using one fixed fictional customer and merchant. No registration, login or real customer information is collected. Stage 1's sample records remain explicitly labeled. Stage 2 adds a separately authorized, bounded anonymous Sandbox checkout; live provider verification is still blocked. Merchant editing/refunds remain unavailable and will need separate operator authority. See [ADR 0002](adr/0002-public-render-demo.md) and [ADR 0003](adr/0003-sandbox-checkout.md).

## Five planned capabilities

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

- Minimize customer effort. Integrating a merchant should automatically create the Purchase Twin.
- Ground consequential explanations in a stored policy or original official source.
- Show distinct states: identified, eligible, awaiting approval, submitted, processing, completed, and failed.
- Present keep/repair options before pushing replacement shopping when appropriate.
- Require properly authorized merchant approval for financial actions.

## Business hypothesis

Useful aftercare might increase consumer preference for PayPal and improve merchant support efficiency. This is a hypothesis to validate with user research, not a measured impact claim.
