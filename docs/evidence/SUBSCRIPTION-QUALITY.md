# Actual private CareOS / Studio subscription evaluation

Date: 2026-10-27. Model: **GPT-6.1 Sol, medium**, official own-client ChatGPT authorization. Developer-run Chromium browser testing against the actual compiled Next.js application and existing PostgreSQL records, with genuine model responses—not mocked HTTP. Code/domain review was assisted by two independent coding-agent sessions; this is **not independent human user research or real-device testing**.

## Outcome and test method

**Private integration passes the exercised journeys.** The original pilot failure is retained [separately](CHATGPT-PILOT.md), not reset or relabeled. New request authority initially allowed 30 calls and was explicitly increased to 50 without resetting history or expiry. Additional paid credits were owner-confirmed OFF; no API-key fallback, PayPal transaction, public deployment or application migration.

Initial customer + Studio pass: **17/19 checks**, with two recorded failures. Successive fixes were followed by **16/16 repaired/unseen checks**, **8/8 review-driven checks**, **1/1 admitted-stream Studio cancellation/recovery check**, and **4/4 broader receipt-phrasing checks**: **29/29 post-fix targeted checks**. Keep those phases separate: these are not an independent holdout or a complete rerun of every case on one final build. The original failed assertions/answers remain in the journal; no expectation was changed to hide them.

The developer reviewed actual care instructions against the exact approved Raspberry Pi 5 / Raspberry Pi OS excerpt, purchase/status answers against saved records and scope, and Studio changes against the displayed dataset. The source remains Raspberry Pi Ltd, CC BY-SA 4.0, [official shutdown guidance](https://www.raspberrypi.com/documentation/computers/getting-started.html#shutdown). No physical product inspection or new provider status check is implied.

## Actual scenarios

| Area | What was exercised | Actual result |
| --- | --- | --- |
| Product identity | Mission, five capabilities, independence from PayPal, current limits; natural “What does CareOS do?” / “Tell me about CareOS” | Source-controlled factual response; no false official-PayPal identity |
| First-time headphones question | “I bought these headphones with PayPal. What should I know, and is there anything you can help me with?” on the saved verified Twin | Correct Forma F-01, USD 129.00, saved date/documents, Sandbox/not real money, no manufacturer manual, useful receipt/policy/aftercare actions |
| Purchase awareness | Exact saved receipt for verified Twin; sample/verified provenance; policy explanation | Correct joined document opens through application; fixed facts, not invented payment evidence |
| Unknown product | Different known purchase, explicit Pi 4, Sony/JBL, bare F-03, generic headphones receipt | Selection instead of substituted receipt/guide; ordinary selected receipt remains useful |
| Conversation | Source-grounded shutdown, two vague/typo follow-ups, reload, switch to headphones and back | Same-product context retained; Pi instructions never reused as headphone care |
| Missing information | Forma manual/repair request, unknown/current recall status | Missing guide explicit, no invented repair instructions or safety all-clear |
| Price Guardian | No recorded adjustment, legacy demo-v1, natural completed-refund and passive payment questions | No invented refund/eligibility; saved evidence distinguished from a fresh PayPal check |
| Grounding | Exact-model/OS source and an adversarial request to contradict it | Approved source instructions displayed; no unsafe override observed |
| Studio live actions | Pending filter, combined visibility plus verified-only summary/evidence, reset | Actual SDK tools visibly change widgets; illustrative labels retained |
| Studio recorded data | Provider-verified filter over the actual empty recorded dataset | Honest zero/empty widgets; no illustrative refund substituted |
| Access/security | Ordinary and wrong-scope browser, another conversation cookie, malformed turn, wrong Origin, financial/secret instructions | Rejected or refused without financial authority or model dispatch where inappropriate |
| Recovery | Actual customer cancellation/replay/saved-record recovery; actual Studio cancellation/replay/new request | Unavailable result persisted; no duplicate inference; subsequent allowed operation succeeds |

The Studio combined-view vocabulary currently means **All stages plus a separate verified-only summary**, not a pending-or-verified-only union. That limitation is visible through the All filter label and should not be described as a union filter.

## Failures found and corrected

1. **Streaming format:** terminal `response.completed.output` was empty despite completed item events. Reconstruct completed items with identity/phase checks, then apply strict schemas. Actual classification, cited care and Studio plans subsequently worked.
2. **Repeated vague follow-up:** retrieving only the previous vague question lost the topic. Search recent same-Twin history for the last grounded topic and reload current approved sources. Added a regression including foreign-Twin exclusion; real typo/reload retests passed.
3. **Unsupported paraphrase:** one generated instruction added “save your work,” absent from the supplied excerpt. It was not treated as source-supported merely because a quote matched. Care now renders AI-selected source wording; contradictory/unsupported model paraphrases cannot become instructions. Added negative controls and real retests.
4. **Recall clarity:** the initial answer was cautious and scope-limited, but the test's wording heuristic missed it. The product now explicitly says the single notice does not confirm current recall status. Original failure retained; expected test was not rewritten to conceal it.
5. **Receipt/identity/status edge cases:** independent review reproduced substituted JBL/F-03 receipts and false refusals/misrouting. A follow-up found “Find JBL … receipt” without “my”; matching now covers command/noun forms and prioritizes an explicit “receipt for …” target. Added regressions plus four actual browser checks, including a generic selected-product positive control. Natural read/identity routing works and malicious mixed commands remain refused. This is bounded tested language support, not a universal purchase-name resolver.
6. **Studio failed-request lifecycle:** inherited route left failed claims unresolved until lease expiry. It now stores unavailable terminal turns and releases the lease, retaining consumed/unknown usage. Actual cancellation, replay and immediate new-plan recovery pass.
7. **Harness hardening:** separate acceptance lock, nonzero exit on failed cases, bounded state writes, safe URL-error redaction and complete bundled license notices. No live evidence overwrite, credential leak or count reset is claimed to have occurred before those fixes.

## Quality targets versus evidence

- Proposed **90% task completion / 95% factual support** are evaluation goals, not population accuracy guarantees. Report the explicit phase denominators above rather than inventing a general success rate.
- **14/14 post-fix displayed care instructions** in the repaired/unseen phase are verbatim supported by approved source text. Applicability was reviewed for the stated Pi 5 / Raspberry Pi OS conditions; this is not a score for every possible factual claim, another OS or an arbitrary manual.
- **Zero critical incorrect financial/safety statements observed in the reviewed final scenarios**, and **zero unauthorized financial actions observed/performed**. This is finite test evidence, not a penetration-test or error-free-AI claim. Browser counters are supplemented by disabled financial flags, absent financial/provider credentials, actual restricted-role checks and source preservation.
- Deterministic identity/receipt/status answers and live interpretation are labeled separately. Do not count saved-record answers as genuine generated responses or fixture tests as live AI.
- First-time-user situations were simulated by the developer; no measured usability claim about independent first-time participants is made. Refusals, unnecessary questions and clarity were reviewed qualitatively, not given a fabricated score.

## Measured performance and usage

Final expanded-session ledger: **25/50 requests used**, **25 remaining** until the original session expiry. **22 completed, one diagnostic format failure, two deliberate cancellations with unknown usage retained.** Two requests were diagnostics, 16 customer and seven Studio; an earlier failed pilot used one separate request. The customer cancellation retained a dispatch marker but no observed provider HTTP status, so provider admission is unconfirmed. A Studio cancellation before dispatch consumed no inference slot; a later Studio test specifically confirmed HTTP 200 before cancellation. Known usage: **13,929 input / 1,881 output tokens**, including **29 reasoning tokens already counted in output**. Unknown usage is excluded, never assumed zero.

Actual customer evidence contains **36 distinct turns: 12 live-interpreted, 24 deterministic saved-record/identity/status responses**. Do not call this “36 generated AI answers.” There were six completed real Studio plans plus one cancelled Studio dispatch. Provider SSE is consumed server-side; the UI waits for the completed, validated answer rather than displaying unchecked partial instructions.

Final measured model-call median **3.486 s**, p95 **8.665 s** among calls with known timing. Actual post-fix care/follow-up browser turns took **6.8–10.7 s** (often classifier plus care call); saved-record turns generally **0.23–0.41 s**, with an extra fresh-browser receipt path at 1.13 s. Studio UI actions took **3.2–4.9 s**. These are single-host finite observations, not an SLA; latency should improve before judging. Token counts are subscription telemetry, **not API-dollar charges or remaining plan allowance**.

## Verification and remaining limitations

- Local unit, type, lint and build checks; full **348 fixture browser/accessibility/visual checks** passed without changing screenshot baselines. Those fixture/transport tests are separate from the real browser/model scenarios above.
- Actual preservation checks passed for **17 readable source tables**, all **3 pre-existing CareOS rows**, legacy spend rows and original **29-table / no-0016-usage-column** schema. No privilege was broadened to inspect protected checkout/operator tables; no claim of a direct full-owner hash audit of those inaccessible tables.
- Browser artifact/trace scan found no copied authorization, scope tokens or database URLs in the checked browser assets, and no private host files packaged as deployment assets.
- Exact-final-commit PostgreSQL/Guardian/paid-adapter CI verification is **pending until the run completes** and is reported at delivery; CI holds no live subscription/financial credentials. Local focused Firefox/WebKit checks passed **8/8** (browser emulation, not physical devices).
- Source coverage is one reviewed Pi care guide and one limited historical CPSC notice. Forma manuals, live Channel3, actual refund/recovery, webhooks, public licensing/deployment, OS isolation, human user research and real-device acceptance remain incomplete/separate gates. Existing paid API adapter and migration 0016 remain prepared, not activated by this work.
