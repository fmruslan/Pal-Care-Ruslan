# Stage 2 completion evidence — actual PayPal Sandbox

**Result: PASS. Verified on 2026-10-22 at 23:04–23:05 UTC.**

Stage 2's bounded Sandbox checkout → retrieved completed capture → automatically persisted Purchase Twin flow is complete and locally verified. This is actual PayPal Sandbox evidence, **not** an injected provider fixture, browser-intercepted transport or simulated webhook. No real money was used.

## Completed case B

| Check | Actual result |
| --- | --- |
| Local checkout | `caf0a232-650e-43c3-a06a-55267e1ffd6b` |
| Purchase Twin | `21301174-dcfa-4e19-b5cc-18f21e745700` |
| Product / amount | Fictional Everyday headphones, F-01; **USD 129.00 / 12,900 minor units** |
| Orders v2 retrieval | HTTP 200; order **COMPLETED**; matching completed final capture |
| Payments v2 capture retrieval | HTTP 200; capture **COMPLETED**, `final_capture: true`, USD 129.00 |
| Provider references | Order ending `3515`; capture ending `4015`; full references retained privately |
| Capture timestamp | `2026-10-22T23:02:00Z` |
| Merchant | Retrieved payee matches both the saved expected merchant and independently confirmed Sandbox Business account |
| Buyer | Retrieved payer matches the independently user-checked Personal Sandbox buyer, not the Business merchant |
| Immediate preference | Saved on this new checkout only and included in the SDK create payload; legacy rows remain null |
| Funding selection | Buyer explicitly reported PayPal balance selected for USD 129.00; wallet funding instrument is not independently inferred from capture completion |
| UI | User confirmed the verified Sandbox Purchase Twin displays successfully in the original Mac Chrome session |

The strict order/capture validators also checked the saved order/application references and invoice, one SKU/quantity, USD total/unit amount, capture identity/final flag and matching timestamps. Product/merchant snapshot and purchase price in the Twin match the saved checkout context. The first capture was requested by the normal browser-return flow after approval; completion was not forced by editing PostgreSQL.

## Repeated read-only command

```bash
pnpm paypal:verify caf0a232-650e-43c3-a06a-55267e1ffd6b
```

Executed **twice**, both with **exit code 0** and the same durable Twin ID. Each invocation retrieved actual Orders v2 and Payments v2 evidence. The command never creates an order, requests capture, issues a refund or writes application records. OAuth authentication is not a money-changing request.

An additional independent read-only provider check explicitly asserted both statuses `COMPLETED`, the USD 129.00 amount, final-capture flag, correct Business merchant and correct Personal payer. Full logs/reference values remain in private operator evidence, not in Git. No credentials, cookie/digest, payer profile or raw provider bodies are published here.

## Exact PostgreSQL cardinality and immutability

The verifier's existence checks were supplemented by read-only queries scoped to this checkout/Twin:

| Record | Count / provenance |
| --- | --- |
| Purchase Twin | **1**, `sandbox`, matching order/capture IDs, amount/currency and product snapshot |
| Receipt | **1**, `sandbox`, contains the matching provider references and USD 129.00 |
| Merchant-policy document | **1**, `sample`, exact frozen demo policy title/content |
| Purchase event | **1**, `sandbox` |

The policy remains a fictional demo policy—not provider-verified warranty coverage, insurance or refund permission. No manufacturer manual or warranty was fabricated.

Complete before/after snapshots of the target checkout, Twin, documents and events were compared around both command runs. They were **identical**: no duplicate rows, changed keys/deadlines/markers or verification-driven writes. This proves repeated *verification* is read-only; concurrent/repeated capture and ambiguous-response recovery additionally have labeled automated regression coverage, not invented external negative-test evidence.

## Separate preserved case A: pending eCheck

Checkout `36c7f7d4-3cce-4b44-a80b-e8e1139940bc` is a **different transaction**, with its own provider references and keys. Its preserved local row still records pending eCheck evidence and **zero linked Twins**. The digest of all prior fields matches the pre-experiment baseline; the new preference column is null. It was not recaptured, cancelled, refunded, cleared, status-edited or provider-requeried as part of case B's completion verification. This report does not claim that eCheck has cleared.

The earlier expired/unattempted checkout remains separately locally retired; its history was not deleted or repurposed for either test.

## Completion boundary and remaining work

**Complete:** the authorized fixed-price Sandbox happy path, server verification and automatic durable Twin/receipt/policy/event persistence, plus repeatable read-only verification and retained security/idempotency regression coverage.

**Not claimed complete:** settlement of the separate eCheck, real-money/production readiness, every possible external provider negative scenario, public Render deployment, webhook listener/signature/delivery verification, refunds/Price Guardian, AI Product Care, recall monitoring, Channel3 or AG Studio. Webhooks remain an [assessment only](../PAYPAL-WEBHOOKS.md).
