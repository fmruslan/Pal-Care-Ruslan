# PayPal integration proof — judge reference

**Proved historically:** an actual PayPal **Sandbox** purchase created a durable Purchase Twin automatically. **Not proved:** a real-money payment, refund, webhook delivery or publicly available judge deployment. This page summarizes existing source and recorded evidence; no new provider call was made to prepare it. [Current implementation/release status](STATUS.md).

## What PayPal does

Pal Care uses the official **`@paypal/paypal-server-sdk` 2.5.0**, pinned in [package.json](../package.json). The [server adapter](../src/lib/commerce/paypal.ts) hardcodes Sandbox, keeps client ID/secret server-side, disables automatic API retries and redirects the buyer to PayPal's validated Sandbox approval link. It is an Orders/Payments integration, not a simulated checkout or universal PayPal purchase-history import.

```text
Fixed fictional catalog + saved product/price/policy snapshot
  → Server: Orders v2 create (persisted idempotency key)
  → Buyer: approve on PayPal Sandbox
  → Server: retrieve order; validate approved order against snapshot
  → Persist capture_attempted_at BEFORE capture POST
  → Orders v2 retrieve + Payments v2 capture retrieve
  → Validate matching completed evidence
  → One DB transaction: completed order + Twin + receipt
                         + sample policy + purchase event
  → Care / Documents / North / native Studio read saved evidence
```

North and Studio have bounded read/presentation tools, **no financial tools**. A natural-language request, chart, source document or visible dashboard grants no payment/refund authority. [Security boundaries](SECURITY.md) · [architecture](ARCHITECTURE.md#stage-2-checkout-boundary).

## Where the proof lives

| Claim | Inspectable source/evidence |
| --- | --- |
| Trusted server-side product/amount and separate create/capture keys are saved before provider work | [`CheckoutService.start`](../src/lib/commerce/service.ts) |
| Attempt marker precedes capture; later checks never dispatch an uncertain second capture | [`processPayment` and `reconcile`](../src/lib/commerce/service.ts) |
| Capture POST success alone is insufficient; retrieve the order and independently retrieve its pinned capture | [SDK adapter](../src/lib/commerce/paypal.ts) · [service](../src/lib/commerce/service.ts) |
| Validate order ID, application reference/custom/invoice IDs, expected merchant, one SKU/quantity, USD unit/total amounts, capture identity/time/final flag and completed statuses | [`validatedOrder`, `captureObservation`, `inspectOrderCapture`, `inspectCaptureStatus`](../src/lib/commerce/verification.ts) |
| Atomically persist the Twin, generated Sandbox receipt, separately labeled sample policy and Sandbox purchase event | [`finalize`](../src/lib/commerce/service.ts) |
| Actual external happy path, exactly-one record counts and unchanged records after two read-only verifier runs | [Stage 2 evidence, October 22, 2026](evidence/STAGE2-VERIFICATION.md) |

The order must be `COMPLETED` with a completed final capture; Payments retrieval must agree on the capture before first finalization. Pending, failed, declined, mismatched or incomplete evidence does not establish a verified purchase. Existing attempted payments use retrieval-only reconciliation; the separate pending eCheck is not claimed cleared. [Checkout decision and recovery tradeoffs](adr/0003-sandbox-checkout.md).

The [operator verification script](../scripts/verify-paypal.ts) retrieves existing Orders/Payments evidence and checks a matching stored Sandbox Twin/receipt. It does not create, capture, refund or write application records. **It is not a judge setup command:** it requires separately authorized private Sandbox configuration and database access. The historical exactly-one policy/event counts and before/after immutability checks were additional read-only checks, not assertions made by this script alone. Full provider IDs, payer details, raw responses and configuration secrets are intentionally omitted here.

## Keep these records distinct

| Record | Meaning |
| --- | --- |
| **October 22, 2026 · USD 129.00 · Everyday headphones F-01** | Genuine Sandbox capture, retrieved and independently verified on October 22 at 23:04–23:05 UTC; one durable Twin/receipt/sample-policy/purchase-event set. Simulated money and fictional goods, not a production purchase. |
| **October 18, 2026 · USD 149.00 · Forma F-01** | Original fictional **Sample** purchase/receipt. No payment processed; not the October 22 transaction. [Fixture source](../src/lib/demo/fixtures.ts). |
| **Ten Sample purchases plus one Verified Sandbox purchase** | Eleven dated saved purchases across ten products at the [ten-product release checkpoint](evidence/CARE-TEN-PRODUCT-RELEASE.md). Recorded totals: Sample **USD 2,942.94**, Verified Sandbox **USD 129.00**. Unpriced Pi ownership is excluded from spending, not treated as free. Bundled fixtures are not the complete deployed database. |

A verified payment does not verify an attached fictional merchant policy, warranty, manual, care event or refund. Preserve each document's own provenance even when its parent purchase is Verified Sandbox.

## Short reusable Devpost narrative

> Pal Care turns a purchase into a useful aftercare record. Our official PayPal Server SDK integration created a real Sandbox order, sent the buyer to PayPal for approval, then independently retrieved and validated Orders and Payments evidence before transactionally creating a Purchase Twin, receipt, sample merchant policy and purchase event. North and native Studio use saved evidence to help explore purchases and product care, without financial tools. One historical USD 129 Sandbox purchase is verified; fictional samples stay separate. Refunds and webhooks are not verified.

## Public-video assets and attribution

- Prefer the repository's original inline [product-art SVGs](../src/components/product-art.tsx) and fictional product/receipt views. [DESIGN](DESIGN.md) identifies the illustrations as original; no retailer/manufacturer image permission is established by this review. The project's [MIT license](../LICENSE) does not license third-party trademarks, photos, music, fonts or vendor components.
- Preserve **Sample / Verified Sandbox** labels and redact full transaction references, payer details, cookies, operator/configuration screens and credentials. Do not film a new financial operation merely to reproduce the historical proof.
- If showing Raspberry Pi care text, retain Raspberry Pi Ltd. attribution, official source and **CC BY-SA 4.0**, with the selection/formatting changes and derived-content license disclosed in the [source register](CARE-SOURCES.md). No manufacturer images/logos were copied; attribution alone is not permission for unrelated third-party content.
- Keep AG Studio's vendor notices/watermark intact; local evaluation is not public judging/video license approval. Preserve bundled [Inter](../public/licenses/inter-OFL.txt) and [Geist](../public/licenses/geist-OFL.txt) font notices with distributions. Confirm applicable vendor/content terms for the final public recording; this is a repository review, not legal clearance.

## Readiness limits

Independent hosted judge access is still a separate gate: the private Tailscale preview is **not** a public judge URL. Intended North inference needs actual valid browser/provider authorization and remaining allowance; historical private AI evidence is not public access or permission to reset an exhausted allocation. Native Studio's public feature/license coverage is unresolved. Hosting, intended access and applicable licenses must cover **December 15, 2026**. No expiry is extended by this document.

**Webhooks are not implemented or signature/delivery-verified; actual PayPal refunds remain unverified and financially disabled pending separate acceptance.** [Webhook assessment](PAYPAL-WEBHOOKS.md) · [Guardian boundary](PRICE-GUARDIAN.md). No production readiness or unrestricted financial authority is claimed.

Submission operating cutoff: **November 12, 2026 at 12:00 PM PST**. Remaining deployment, authorization, licensing, public-video and final verification gates stay visible in [STATUS](STATUS.md) and [judging guidance](JUDGING.md); a source link or historical green test does not close them.
