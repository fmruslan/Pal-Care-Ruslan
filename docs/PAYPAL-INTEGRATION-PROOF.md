# PayPal integration proof — judge reference

**Proved historically:** an actual PayPal **Sandbox** purchase created a durable Purchase Twin automatically. **Public judge app:** [palcare-judge.onrender.com](https://palcare-judge.onrender.com), with hosted DeepSeek Flash, guest authorization and native AG Studio live verification. Render holds a **sanitized historical copy with pseudonymized provider references**, not fresh PayPal validation. **Not proved:** a real-money payment, refund or webhook delivery. This page summarizes existing source and recorded evidence; no new provider call was made to prepare it. [Current implementation/release status](STATUS.md).

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

For judges, the evidence chain is **independent historical Orders/Payments verification → original October 22 purchase/receipt → sanitized Render copy → Care/documents → North → actual native AG Studio Agent Framework execution/read-back**. Capture, refunds and webhooks are not enabled on Render. Neither other Sample records nor attached sample policies become PayPal-validated through this chain.

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
| **October 22, 2026 · USD 129.00 · Everyday headphones F-01** | Genuine Sandbox capture, retrieved and independently verified on October 22 at 23:04–23:05 UTC; one durable Twin/receipt/sample-policy/purchase-event set. Render displays a sanitized historical copy with pseudonymized provider references, not a new provider check. Simulated money and fictional goods, not a production purchase. |
| **October 18, 2026 · USD 149.00 · Forma F-01** | Original fictional **Sample** purchase/receipt. No payment processed; not the October 22 transaction. [Fixture source](../src/lib/demo/fixtures.ts). |
| **Ten Sample purchases plus one Verified Sandbox purchase** | Eleven dated saved purchases across ten products at the [ten-product release checkpoint](evidence/CARE-TEN-PRODUCT-RELEASE.md). Recorded totals: Sample **USD 2,942.94**, Verified Sandbox **USD 129.00**. Unpriced Pi ownership is excluded from spending, not treated as free. Bundled fixtures are not the complete deployed database. |

A verified payment does not verify an attached fictional merchant policy, warranty, manual, care event or refund. Preserve each document's own provenance even when its parent purchase is Verified Sandbox.

## Hosted release and navigation evidence

- [PR #42](https://github.com/fmruslan/Pal-Care-Ruslan/pull/42), main `802e70d`: hosted DeepSeek Flash, guest authorization and actual native Studio live verification; [full CI 43152523569](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43152523569), [exact-main verification 43154774887](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43154774887).
- [PR #43](https://github.com/fmruslan/Pal-Care-Ruslan/pull/43), main `f52b1ca`: [full CI 43164157041](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43164157041), [exact-main verification 43166154903](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43166154903), deployment `7729914737`.
- Actual original `headphones` query → explicit October 22 Sandbox selection → purchase/receipt/care/back passed with **zero further POSTs**. The first composite check later hit a panel-restore harness timeout, retained as a failure. A separate fresh warranty question passed exact selection, immutable history and no-POST navigation. [Recorded observations](https://github.com/fmruslan/Pal-Care-Ruslan/pull/43#issuecomment-6816281343). These checks did not revalidate PayPal.

For a short walkthrough, select the October 22 purchase and ask **“What warranty evidence is saved for this purchase?”**, then use Insights to ask **“Create a category chart for my saved purchases.”** Use **at most two live questions** under actual guest authorization/remaining allowance. Navigate freely through saved answers, receipt and care without further inference or question resubmission. [Judge guide](JUDGING.md).

## Short reusable Devpost narrative

> Pal Care turns a purchase into a useful aftercare record. Our official PayPal Server SDK integration created a real Sandbox order, sent the buyer to PayPal for approval, then independently retrieved and validated Orders and Payments evidence before transactionally creating a Purchase Twin, receipt, sample merchant policy and purchase event. The public Render app uses a sanitized copy of that October 22 USD 129 purchase with pseudonymized provider references, not fresh PayPal validation. Care and documents connect to North's hosted DeepSeek Flash and actual native AG Studio Agent Framework execution/read-back. Fictional samples and sample policies remain distinct from payment proof. Render enables no capture, refund or webhook flow.

## Public-video assets and attribution

- Prefer the repository's original inline [product-art SVGs](../src/components/product-art.tsx) and fictional product/receipt views. [DESIGN](DESIGN.md) identifies the illustrations as original; no retailer/manufacturer image permission is established by this review. The project's [MIT license](../LICENSE) does not license third-party trademarks, photos, music, fonts or vendor components.
- Preserve **Sample / Verified Sandbox** labels and redact full transaction references, payer details, cookies, operator/configuration screens and credentials. Do not film a new financial operation merely to reproduce the historical proof.
- If showing Raspberry Pi care text, retain Raspberry Pi Ltd. attribution, official source and **CC BY-SA 4.0**, with the selection/formatting changes and derived-content license disclosed in the [source register](CARE-SOURCES.md). No manufacturer images/logos were copied; attribution alone is not permission for unrelated third-party content.
- Keep AG Studio's vendor notices/watermark intact; **no license key is confirmed**. The [sponsor article](https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/) describes judging coverage but does not prove entitlement through December 31. Preserve bundled [Inter](../public/licenses/inter-OFL.txt) and [Geist](../public/licenses/geist-OFL.txt) font notices with distributions. This records an unresolved coverage question, not an established compliance block or legal clearance.

## Readiness limits

Independent hosted judge access is live at the Render URL above; the private Tailscale preview remains separate. North inference still requires actual valid guest/provider authorization and remaining allowance, without resets or renewals to bypass limits. Hosting, intended access and applicable license coverage must last through **December 31, 2026 at 23:59 PST** (**January 1, 2027 at 08:00 UTC exclusive**), superseding the earlier December 15 requirement for this pass. AG Studio coverage through that date is not confirmed by a key or the sponsor article. No expiry is extended by this document.

**Webhooks are not implemented or signature/delivery-verified; actual PayPal refunds remain unverified and financially disabled pending separate acceptance.** [Webhook assessment](PAYPAL-WEBHOOKS.md) · [Guardian boundary](PRICE-GUARDIAN.md). No production readiness or unrestricted financial authority is claimed.

Submission operating cutoff: **November 12, 2026 at 12:00 PM PST**. Sustained access, licensing coverage, public-video and final submission evidence stay visible in [STATUS](STATUS.md) and [judging guidance](JUDGING.md); the hosted release does not establish future availability or close unrelated gates.
