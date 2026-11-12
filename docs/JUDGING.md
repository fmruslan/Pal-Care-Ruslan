# Judge-oriented guide

## Current judge experience and evidence

**Open [Pal Care on Render](https://palcare-judge.onrender.com).** Hosted **DeepSeek Flash**, guest authorization and actual native **AG Studio SDK** execution/read-back were live verified in [PR #42](https://github.com/fmruslan/Pal-Care-Ruslan/pull/42), main `802e70d`: [full CI 43152523569](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43152523569), [exact-main verification 43154774887](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43154774887). Navigation release [PR #43](https://github.com/fmruslan/Pal-Care-Ruslan/pull/43), main `f52b1ca`: [full CI 43164157041](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43164157041), [exact-main verification 43166154903](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/43166154903), deployment `7729914737`.

**The central story is PayPal → saved purchase → aftercare → useful AI/native analytics.** Independent Orders/Payments retrieval verified the historical **October 22, 2026 · USD 129.00 Sandbox** purchase and its original receipt. Render serves a **sanitized historical copy with pseudonymized provider references**, not fresh PayPal validation. Care/documents lead into North and actual native Studio presentation tools with read-back. Other samples and attached sample policies are not PayPal-validated. Render has no enabled capture, refund or webhook flow. [PayPal proof](PAYPAL-INTEGRATION-PROOF.md) · [current implementation truth](STATUS.md).

**Actual navigation evidence:** the original `headphones` question → explicit October 22 Sandbox selection → purchase/receipt/care/back passed with **zero further POSTs**. The first composite check later timed out in the panel-restore harness; that failure is retained. A separate fresh warranty question passed exact selection, immutable history and no-POST navigation. These are distinct observations, not a claimed clean composite pass. [PR #43 live evidence](https://github.com/fmruslan/Pal-Care-Ruslan/pull/43#issuecomment-6816281343).

## Historical private evidence and foundation

**Private AI is genuinely verified, not still wholly fixture-only.** CareOS uses its own official ChatGPT authorization with **GPT-6.1 Sol / medium** in the owner-only loopback preview. Actual grounded care/follow-ups, purchase isolation, saved-record answers and model-planned **merchant Studio** presentation tools were exercised. The retained initial result was 17/19; successive post-fix phases passed 29/29 targeted checks, not a population accuracy score or complete holdout rerun. Scripted/fixture and deterministic responses remain labeled separately. [Actual private AI evidence](evidence/SUBSCRIPTION-QUALITY.md) · [private runtime](SUBSCRIPTION-DEVELOPMENT.md).

**Historical Customer Intelligence checkpoint:** native AG Studio grid/chart/KPI, custom evidence widgets, cross-filters, layouts and CareOS controls had isolated test evidence plus **5/5 actual private customer Sol/SDK tasks**. The then-pending integrated acceptance and historical Home / Purchases / Insights / Documents navigation describe that checkpoint, not the current hosted release above. Earlier merchant success and green `9f169e8` CI do not independently verify later code. [Customer evidence and owner walkthrough](evidence/CUSTOMER-INSIGHTS.md).

**PayPal purchase evidence already exists.** Stage 2's separately approved USD 129.00 case has matching completed Orders/Payments capture evidence, one durable Twin/receipt/policy/purchase event and two read-only verifier passes. The policy is labeled sample; the earlier pending eCheck remains separate/unverified. Do not create another purchase or claim a real refund to complete this narrative without separate approval. [Actual purchase evidence](evidence/STAGE2-VERIFICATION.md).

The accepted local Phase B cutover through **0015 / 29 tables** and restricted reader/CareOS connections is preserved; it is not public OS isolation. Price Guardian financial activation, deferred 0016, actual Channel3 and webhooks are not established by the hosted release. One reviewed official CPSC notice is not comprehensive safety monitoring. [Local cutover](evidence/PHASEB-CUTOVER.md) · [historical Stage 5](evidence/STAGE5-VERIFICATION.md) · [continuation evidence](evidence/CONTINUATION-VERIFICATION.md).

## Why Pal Care?

AI shopping agents help consumers purchase items. Pal Care tests the idea that PayPal can keep helping **after checkout** through a persistent, evidence-backed Purchase Twin, proactive care, and verified outcomes.

The customer benefit is less work finding records, understanding supported care and seeing what legitimately needs attention. This is a product hypothesis, not measured savings, comprehensive purchase-history access, warranty/insurance or guaranteed refund coverage. Direct Glance/Tap tasks should not require a chat conversation. [Product scope](PRODUCT.md) · [CareOS](CAREOS.md).

## Short judge walkthrough — at most two live questions

1. Open the [public app](https://palcare-judge.onrender.com). Use **Care / Purchases & Docs / Insights**; in Purchases, select **October 22, 2026 · USD 129.00 · Everyday headphones F-01**, not the October 18 Sample headphones. Open its receipt and care/documents. Explain the historical Sandbox verification and sanitized Render copy.
2. With that purchase explicitly selected, ask North: **“What warranty evidence is saved for this purchase?”** Inspect the saved evidence and its provenance; a sample policy is not PayPal-validated warranty coverage. Return through purchase, receipt, care and history without resubmitting the question.
3. Open Insights and ask: **“Create a category chart for my saved purchases.”** Show the actual native Studio chart and SDK state/data read-back, keeping Sample and historical Sandbox provenance visible. A model plan or success message alone is not proof of native execution. The separate typed customer-command path uses the real [Studio Agent Framework runner](../src/components/intelligence/customer-agent.ts); the saved-record chart path applies a validated SDK state. Do not label a direct SDK chart action as proof that a different runner executed.
4. Navigate back to the saved answer/purchase. **Navigation is free of further inference; do not repeat questions to navigate.** Stop after these two live questions and respect actual guest authorization and remaining allowance. Do not reset or renew limits for the walkthrough.

The historical private Sol checks used their then-valid session and retained all attempts/unknowns. They are separate from hosted DeepSeek Flash acceptance and do not grant fresh provider or financial authority.

## Judging criteria

| Equally weighted criterion | Intended evidence |
| --- | --- |
| Technological Implementation | Central verified PayPal integration, meaningful real CareOS/Studio behavior, scoped state, safe retries and reproducible tests |
| Design | Coherent Care / Purchases / Insights experience with accessible, truthful receipt/document actions |
| Potential Impact | Credible specific customer problem and demonstrated task benefit; user research/impact claims only where actually measured |
| Innovation/Idea | Persistent item-level aftercare and customer-controlled evidence-led analytics, not a generic chat wrapper |
| Presentation | A clear working end-to-end customer narrative in under three minutes |

These criteria are summarized from official [rules](https://paypalaihackathon.devpost.com/rules) search excerpts, not a newly fetched full rules document.

## Award limits and sponsor fit

**At most one Grand Prize OR one Honorable Mention, plus at most one Sponsor Prize.** Multiple meaningful integrations may be considered, but neither Grand + Honorable Mention nor multiple sponsor wins may be stacked. Awards/eligibility remain the judges' decision, not an implementation claim. [Rules §8](https://paypalaihackathon.devpost.com/rules) · [official FAQ](https://paypalaihackathon.devpost.com/details/faqs).

| Award | Published prize | Pal Care evidence/strategy boundary |
| --- | --- | --- |
| Overall Grand Prizes | **$12,000 / $8,000 / $5,000 USD cash** | Prioritize a coherent useful customer product with central PayPal + AI, not prize-padding integrations. |
| Honorable Mentions | **$5,000 USD cash each**, one award per category | Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce; no category or win is claimed. |
| AG Grid / AG Studio | **$5,000 first; $2,000 second; three × $1,000 third-place cash awards** | Primary sponsor fit: live-verified native analytics, inspectable Agent Framework integration and exact SDK/data read-back. No license key is confirmed; preserve the watermark. Sponsor judging-coverage guidance does not establish entitlement through December 31. |
| Channel3 | **$1,500 USD cash**, one winner | Requires meaningful **real API/MCP calls and returned product evidence** in the experience; fixture cards or an unactivated adapter do not establish this. Credentials/free-credit activation require owner approval. |
| Render | **$1,000 / $750 / $500 Render credits**, not cash | Public hosting is live at `https://palcare-judge.onrender.com`, with release evidence above. Sponsor guidance promotes Workflows; **do not expand architecture into Render Workflows** for an award. Deployment is not a sponsor-eligibility claim. |

[Full integration/sponsor matrix and sources](INTEGRATIONS.md). Optional APIMatic/Bryntum awards are not a reason to add unrelated product scope.

## Submission checklist

- [x] Historical reproducible foundation build and exact-commit CI evidence; not acceptance of the new customer increment or a final eligibility declaration.
- [x] Complete foundation source and top-level MIT license.
- [x] Documented setup, migrations, sample data and automated tests.
- [x] Actual completed Sandbox capture and automatic Twin/receipt/policy/event evidence, with repeated read-only verification; not a refund, webhook or AI claim.
- [x] Genuine private CareOS and merchant-Studio Sol Medium acceptance in the exercised historical scenarios; not paid API/public/customer-Insights acceptance.
- [x] Hosted DeepSeek Flash, guest authorization and native Studio live acceptance; exact-main release evidence recorded above.
- [x] PR #43 exact-selection/history/no-POST navigation evidence, with the separate composite harness timeout retained.
- [ ] Continued hosted/model access and applicable AG Studio feature/license coverage through the required access window; no license key is confirmed.
- [ ] Public YouTube demo **under 3 minutes**.
- [ ] Devpost description with genuine PayPal, AI and sponsor details.
- [ ] Maintain working judge access through **December 31, 2026 at 23:59 PST** (**January 1, 2027 at 08:00 UTC exclusive**).
- [x] Fictional read-only browsing requires no customer login; private model/operator capabilities and secrets are not granted to public visitors.

Use the conservative submission cutoff **November 12, 2026 at 12:00 PM PST**; preserve judge access through **December 31, 2026 at 23:59 PST** (**January 1, 2027 at 08:00 UTC exclusive**), superseding the earlier December 15 requirement for this pass. The historical November 5 recommendation is superseded. Actual authorization, subscription, hosting and license expiries remain enforced; this requirement does not extend them.

## Available proof

- [Sanitized Stage 2 acceptance report](evidence/STAGE2-VERIFICATION.md): actual APIs, correct USD amount/merchant, exact PostgreSQL counts, two exit-0 verification runs and preservation of the separate pending case. Full provider references/logs remain private; the report is not mock evidence.
- [Actual subscription quality](evidence/SUBSCRIPTION-QUALITY.md): retained failures/corrections, source meaning review, real customer conversations and legacy merchant-Studio model/tools; limited developer-run scenarios, not independent human or real-device certification.
- [CareOS UX acceptance](evidence/CAREOS-UX.md) and [private access/CI evidence](evidence/PRIVATE-ACCESS.md): bounded actual preview checks and baseline CI, not the new customer code's acceptance.
- [Customer Insights evidence](evidence/CUSTOMER-INSIGHTS.md): retained static failures, actual **5/5 customer Sol/SDK** tasks, exact receipt/zero-adjustment checks and scoped automated results; owner/real-device and exact-new-commit CI remain distinct.

## Remaining external proof

- Actual PayPal refund IDs/status and refund reconciliation (redacted as appropriate); capture evidence already exists for Stage 2.
- Actual HTTPS webhook signature/delivery/deduplication evidence if webhooks are implemented; current capture/refund idempotency/approval code and synthetic tests already exist.
- Broader recall coverage is not claimed; the one reviewed historical CPSC source and conservative matching are already evidenced.
- Channel3 returned product records with source/price timestamps.
- Independent human/real-device feedback and broader behavior beyond the bounded live scenarios. Hosted acceptance and exact-main CI above do not erase the retained composite harness timeout.
- Confirmed AG Studio feature/license coverage and sustained judge access through December 31. No key is confirmed; the sponsor article's judging coverage is not proof of December 31 entitlement. Preserve the watermark; this uncertainty does not itself establish a compliance block.
- Actual refund/recovery acceptance beyond existing synthetic duplicate/timeout/unauthorized-access tests.
- Final public video and submission completion remain separate from the evidenced Render deployment. See STATUS for runtime/isolation scope and remaining limitations.

## References

**Source limitation:** direct Devpost retrieval returned HTTP 403 here. Event/rule/sponsor details above were checked through **web-search excerpts of the linked official pages**, not a fresh full-document fetch or eligibility/legal review. Reconfirm the complete current terms in the owner's browser before final submission or license/provider activation. Search-result time variants do not relax the conservative noon-PST cutoff.

- [Official rules](https://paypalaihackathon.devpost.com/rules) · [FAQ](https://paypalaihackathon.devpost.com/details/faqs) · [schedule](https://paypalaihackathon.devpost.com/details/dates)
- [Official prizes](https://paypalaihackathon.devpost.com/) · [resources](https://paypalaihackathon.devpost.com/resources)
- [AG Grid sponsor guidance](https://paypalaihackathon.devpost.com/details/aggrid) · [AG Grid's own hackathon article](https://www.ag-grid.com/blog/hackathon-paypal-and-ag-studio/)
- [Channel3 sponsor guidance](https://paypalaihackathon.devpost.com/details/channel3) · [Render sponsor guidance](https://paypalaihackathon.devpost.com/details/render)
