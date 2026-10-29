# Product vision and scope

## North star

**Approved customer-first direction — new increment under integrated verification, not shipped:** one personal purchase and aftercare product, not competing customer/merchant applications. Primary navigation is **Home / Purchases / Insights / Documents**. `/insights` connects **My Purchases / Documents & Care / Price Adjustments** to saved Purchase Twins, document provenance, supported care and recorded outcomes using actual AG Studio. CareOS is the shared customer assistant; merchant policies/catalog/approvals remain separately authorized secondary functions. Five actual private customer Sol/SDK tasks passed; remaining integrated checks, exact-commit CI and owner review are separate gates. [Capability-based acceptance](CUSTOMER-FIRST-PLAN.md) governs completion; [STATUS](STATUS.md) records evidence rather than planned capability.

**Stage 4:** proactive Price Guardian and protected merchant approval are implemented with financial activation off. The future-only inactive `demo-price-v2` promise covers the exact SKU for 14 days, one adjustment/capture, up to $20. Customers never initiate claims. Actual new purchase/refund and unknown-ID recovery acceptance require separate approval. Existing `demo-v1` purchases are never retroactively eligible. [Contract](PRICE-GUARDIAN.md).

**Pal Care makes the purchase the beginning of a useful care relationship.** A verified PayPal sandbox order creates a Purchase Twin, connecting product identity, trusted documents, applicable terms, and meaningful after-purchase events.

## Who it serves

- **Customers** who want reliable records, timely care information, and eligible savings.
- **Participating merchants** provide the longer-term funded aftercare model and resolve legitimate adjustments under their own policies. Merchant SaaS administration, billing and onboarding are outside this submission; public customers receive no operator authority.

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

**Customer-first acceptance:** Home → correct dated Purchase Twin/receipt → Insights (**My Purchases / Documents & Care / Price Adjustments**) → a useful CareOS-controlled view with exact SDK/data postconditions → matching document/source care or an honest evidence gap. Native grid/chart/KPI, custom evidence, cross-filtering and browser-local layouts must work as one product. This new customer path is still under verification; prior private CareOS/merchant-Studio model acceptance does not establish it.

**Separate financial acceptance, incomplete and separately authorization-gated:**

PayPal sandbox capture → stored Purchase Twin → controlled merchant price update → deterministic eligibility → merchant approval → actual PayPal partial refund → authoritative verified refund status.

The bounded capture/Twin case already has historical actual evidence; the remaining refund/recovery workflow is not accepted or authorized by this product description. Customers do not initiate claims, and analytics never grants merchant authority. Use a separate historical item for a real official recall source; optional alternatives through Channel3 require actual provider acceptance, not fixture products.

## Explicit non-goals

No barcode scanning; no universal access to PayPal consumer history; no general-purpose claims platform; no subscription manager; no automated external retailer checkout; no guaranteed refunds, warranty extension, or insurance; no simulated events presented as live external changes.

## Service principles

### CareOS interaction principle: assistant-first, not chat-first

- **Glance:** one or two factual, dismissible suggestions from saved records. No invented price monitoring, coverage or recalls.
- **Tap:** direct receipt/document/guide/history navigation. Conversation is optional.
- **Talk:** one persistent customer assistant, always explicit about the selected Purchase Twin and execution mode. Switching products must not mix receipts or care evidence.

These interactions have explicit fixture mode plus actual owner-only Sol Medium subscription acceptance; population accuracy, independent user research and public/API acceptance remain separate. One Raspberry Pi 5 reference sample has licensed exact-model guidance. Forma F-01 has no manufacturer manual. Reference ownership is not verified payment, and its zero placeholder is not a market price. [Actual quality evidence](evidence/SUBSCRIPTION-QUALITY.md) · [CareOS](CAREOS.md) · [sources](CARE-SOURCES.md).

Useful fresh Sol Medium inference for customer acceptance is authorized within the existing actually unexpired session and remaining accounting. Check actual state before each call; preserve attempts/unknowns and stop on expiry/exhaustion/denial. No new allowance, reset/renewal or paid fallback is authorized. The five customer-path calls and their preserved accounting are recorded at the [verification checkpoint](STATUS.md).

- Minimize customer effort. Integrating a merchant should automatically create the Purchase Twin.
- Ground consequential explanations in a stored policy or original official source.
- Show distinct states: identified, eligible, awaiting approval, submitted, processing, completed, and failed.
- Present keep/repair options before pushing replacement shopping when appropriate.
- Require properly authorized merchant approval for financial actions.

## Business hypothesis

Useful aftercare might increase consumer preference for PayPal and improve merchant support efficiency. This is a hypothesis to validate with user research, not a measured impact claim.
