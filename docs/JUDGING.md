# Judge-oriented guide

**Current status:** Documentation scaffold only; the application is **not implemented**. See [Implementation Status](STATUS.md). This page is a planned evidence checklist, not proof of completed integration.

## Why Pal Care?

AI shopping agents help consumers purchase items. Pal Care tests the idea that PayPal can keep helping **after checkout** through a persistent, evidence-backed Purchase Twin, proactive care, and verified outcomes.

## Planned flagship demonstration

1. Complete a genuine PayPal Sandbox order/capture for a controlled merchant and sandbox buyer.
2. Automatically create an item-level Purchase Twin, payment record, receipt and available policy/documents.
3. Replay a **clearly labeled simulated merchant price change** through real application logic.
4. Inspect the recorded merchant-policy version and deterministic eligibility calculation.
5. Have an authorized merchant user approve the price adjustment.
6. Complete and verify a real PayPal Sandbox partial refund; demonstrate safe duplicate handling.
7. Inspect separate historical product safety data sourced from the real CPSC and optional Channel3 replacement suggestions.
8. Use AG Studio's agent to investigate care events and modify an interactive merchant dashboard.

## Judging criteria

| Equally weighted criterion | Intended evidence |
| --- | --- |
| Technology | Verified PayPal APIs, AI interpretation, durable state, authorization, safe retries and tests |
| Design | Clear purchase-led experience with accessible, truthful action states |
| Impact | Observed customer benefit, transparent metrics, real tester feedback |
| Innovation | Persistent item-level, event-driven aftercare with verified results |
| Presentation | One coherent end-to-end narrative in under three minutes |

## Submission checklist

- [ ] Public functional app or reproducible runnable build.
- [ ] Complete public source and top-level open-source license.
- [ ] Documented setup, migrations, sample data and automated tests.
- [ ] Public YouTube demo **under 3 minutes**.
- [ ] Devpost description with genuine PayPal, AI and sponsor details.
- [ ] Working judge access through December 15, 2026.
- [ ] Test credentials distributed securely, never committed.

## Proof to add once implemented

- Verified PayPal capture and refund IDs/status (redacted as appropriate).
- Code references for idempotency, approval, webhook signature validation and deduplication.
- Actual CPSC source records and documented product matching.
- Channel3 returned product records with source/price timestamps.
- Working AG Studio custom widgets and agent dashboard updates.
- Results of duplicate refund, provider timeout and unauthorized-access tests.

## References

- https://paypalaihackathon.devpost.com/rules
- https://paypalaihackathon.devpost.com/details/faqs
- https://paypalaihackathon.devpost.com/resources
