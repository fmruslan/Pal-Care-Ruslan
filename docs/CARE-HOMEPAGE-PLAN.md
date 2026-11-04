# Care homepage — researched implementation proposal

**Status: complete plan approved; implemented candidate in final verification.** The owner explicitly approved this plan and continuous implementation/test/fix/commit/push/exact-commit CI and rollback-protected private 8444 delivery. The subsequent [exact persistence/permissions scope](CARE-PERSISTENCE-APPROVAL.md) is separately approved **after remaining gates**; that approval is not activation evidence. This plan does not establish implemented features or acceptance. [STATUS](STATUS.md) remains implementation truth.

## Outcome and selected gate

Care should immediately explain **what matters, where it stands and what to do next**. Deliver this as capability **C: unified customer experience**, reusing the A/B customer intelligence and native analytics foundations, followed by D integrated acceptance and E private-release readiness. The new direction is **Care / Purchases / Insights**; earlier Home / Insights descriptions are historical design context.

Recommendation: a deterministic, evidence-backed Care feed, with North interpreting questions and preparing useful next steps through validated tools. Page loads must work without inference. A language model must not decide whether a refund happened, a deadline exists or monitoring is active.

## Research and implications

| Official reference | Finding | Pal Care decision |
| --- | --- | --- |
| [Shop order statuses](https://help.shop.app/en/shop/delivery-tracking/view-order-status) | Store and carrier statuses have different sources; waiting for details, partial refunds and completed refunds are distinct. | Keep evidence origin and observation date per fact. Missing evidence is not completion or an all-clear. |
| [Shop returns](https://help.shop.app/en/shop/managing-orders/returns) | In-app return actions depend on merchant support; otherwise the customer uses the merchant's site. | Only expose executable, supported actions. A prepared return request is not merchant acceptance. |
| [Amazon return tracking](https://www.amazon.com/gp/help/customer/display.html?nodeId=GNF2KMBB2JD4VXV8) | Item-specific return/refund details, dated progress and carrier links explain the next step. | Tie every case to the exact dated Purchase Twin; show a short timeline in details. |
| [Amazon refund status](https://www.amazon.com/gp/help/customer/display.html?nodeId=GMP8PC8KBY5FCPM2) | Refund processing and receipt have different timelines. | Keep return delivery, merchant processing, refund issuance and payment receipt separate; do not import Amazon's time estimates into other policies. |
| [W3C status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | Updates should be announced without unnecessarily moving focus or interrupting the user. | Use concise live status messages, semantic timelines and stable focus; no repeatedly announcing whole cards. |

Shop and W3C pages were directly retrieved. Amazon's official content was available through search; direct retrieval of the return page returned HTTP 503. These references support interaction design, not access to Amazon/Shop data or merchant integrations.

## 1. Information architecture and visual contract

- **Care:** `/dashboard`, with `/` opening this default customer destination. Heading **Care for what you own.**
- **Purchases:** `/purchases`, reusing the existing product/document library, unified metadata search, receipt previews and All documents view.
- **Insights:** `/insights`, retaining My Purchases / Documents & Care / Price Adjustments and native AG Studio execution.
- Preserve `/vault/[id]`, dated purchase identities and `/documents/[id]`. Redirect legacy library entry points with their supported query state; migrate historical Home search links deliberately rather than dropping their filters.
- Top header, one prominent **Search / Ask North** field, **Needs attention / Completed**, then the feed. One North root coordinator across routes.
- Desktop card: neutral product-art surface → product/date and status → one or two factual lines → one bronze primary action. Mobile stacks the same information without horizontal scrolling.
- Use existing local Inter, semantic Bronze/Violet tokens, green only for appropriately verified facts, 16px card corners, restrained shadows and generous spacing. Retain original product artwork where actual licensed imagery is unavailable.
- No KPI strip, promotional banner or bottom “North insights” banner. Sources and secondary actions use quiet disclosures.

## 2. Feed semantics

**Needs attention** is the open-care view. Its first group is **Action needed**; a quieter second group is **Being tracked — no action needed** for waiting returns/refunds and genuinely active watches. This preserves two main filters without falsely telling the customer to act on a pending process.

**Completed** contains resolved care tasks and supported outcomes, each with its actual provenance. A completed price-adjustment task may be a partial refund of the purchase; the product must still say **Partially refunded**, with the exact amount. Cancellation, rejection, expiry and dismissal are not successful completion: they remain in purchase history and are explained when a related case is opened. An actionable failed attempt remains in the open view.

- Normal active warranties and generic available manuals live in purchase details, not permanent attention cards. A supported approaching deadline or specific useful care finding may create an item.
- Missing evidence creates an attention item only when it blocks a selected task; do not flood Care with a missing-warranty card for every product.
- Priority: source-backed safety concern requiring action; approaching explicit deadline; actionable return/refund issue; actionable price opportunity; useful care task; waiting items. Stable ties use deadline, event time and case ID. Do not reorder while someone is interacting.
- One card per actionable case, visually grouped by purchase. Do not merge a safety issue into a lower-priority price card or count every history event as a new task.
- Empty: **No actions found in your available records.** Show incomplete coverage when applicable. No records, no filter matches, unavailable data, stale evidence and provider-disabled states are distinct.
- Reversible browser-local hiding is a presentation preference, never a completed outcome. New material evidence can resurface a hidden case; history is retained.

## 3. Functional scope and current gaps

| Workflow | Reusable foundation | Proposed working flow and evidence requirement |
| --- | --- | --- |
| Price comparison | Recorded catalog observations, deterministic Guardian eligibility, separately bounded replacement discovery | Show original paid price and comparable observed price with seller, exact model/variant, currency and checked time. Explain policy eligibility separately. Alternatives are labeled alternatives, not same-product savings. Primary action: **Compare prices** or **View adjustment**. |
| Supported watches | Bounded Guardian detection job; no deployed continuous schedule | Persist a watch for an eligible fixed-catalog product/source; expose its actual cadence, last successful check, next due check and paused/error/expired states. Recommend an initial daily recorded-catalog check, subject to explicit worker activation. “Saved for checking” is not “Monitoring active.” No new paid discovery polling. |
| Returns | Purchase/document links and historical return events; no structured return lifecycle | Prepare a source-linked return summary, open a supported merchant/carrier link, and track dated evidence or explicitly manual milestones. Timeline can include prepared, requested, accepted, shipped, received and closed, with unknown steps left unknown. Do not infer earlier milestones from a later event. No real shipment or return exists for fictional goods. |
| Refunds | Guardian case state machine, immutable attempts and independently verified Sandbox evidence rules | Show requested/approved/pending/unresolved/verified amounts separately, with case history. **View refund details** is read-only. No customer button approves or sends money; no “received in your account” claim from issuance alone. |
| Warranties | Saved documents and exact-product source matching; no verified structured expiration dates | Store explicit warranty terms, source/version and applicable identity. Show an expiry only from an explicit date or a fully evidenced deterministic calculation with its basis displayed. Manual dates say **Reported by you**. Unknown duration/start date stays unknown; current demo terms explicitly provide no real warranty. |
| Product care and safety | Approved exact-product knowledge and saved official-source recall assessments | Link to the matching source and actionable guidance. Preserve limitations on historical coverage and physical/model identification. A possible recall match is not a confirmed recall; unrelated reference-product guidance cannot become owned-product guidance. |

All five workflows must have functioning details/actions or a truthful unsupported state. Illustrative full-lifecycle scenarios belong in a clearly labeled fictional demonstration; they must never be inserted as externally verified records.

### Persistence and authorization dependency

For durable watches, return progress and warranty records, propose a small typed Care domain inside the existing monolith:

- A `care_cases` table for exact Twin association, case type, typed payload and revision; a separate `care_events`-style append-only table with a distinct SQL name to avoid the existing historical-events table; and watch configuration/check-state storage where needed.
- Every factual event carries source kind, source identity/reference, effective date, recorded date and validation state. Evidence for a payment cannot establish a warranty or return. Corrections append superseding facts rather than rewriting original receipts or provider ledgers.
- Reuse Guardian records directly; do not create a second financial ledger. Derive the feed with a pure projection over existing and new typed records, using bounded completeness-aware reads.
- Manual reports remain separate from external evidence. The current public read-only demo has **no generic manual-write authority**. Form previews/drafts do not grant one. Durable reports require an explicitly approved, narrowly scoped actor/write capability; do not repurpose a North cookie or reader URL as permission.
- Author additive, reviewed Drizzle SQL and least-privilege access changes; prove them in the dedicated test database. Applying application migrations, provisioning credentials or activating a new writer/worker requires separate exact approval. Plan approval alone does not grant those boundaries.

Until that rollout is approved and verified, durable new workflows remain incomplete. A read-only Care shell is useful progress but must not be reported as the full functional release.

## 4. North integration

- Extend the existing genuine model/tool path with a typed read-only Care query and evidence-backed preparation results. Reuse the same cases in cards and answers so North cannot contradict the screen's recorded status.
- On load, deterministic rules surface findings from available records without model/provider calls. North explains, investigates and prepares next steps when explicitly asked.
- Keep the single field's explicit Search and North controls. Preserve provider-free literal metadata search; natural questions reach the model unchanged, not a new keyword router. Search scope is visible; purchase/document results can open the exact library record without losing the question.
- Inline answers offer one relevant next action and expandable sources. Preparing a return message produces an editable/copyable draft, not a sent request. Selecting a product supplies exact dated context without automatically sending a turn.
- Preserve server-owned follow-up anchoring, original UUID/attempt/accounting semantics, drafts, read-only History, stale-navigation guards and GET-only recovery of unknown dispatched work.
- Care → product → documents → native Insights → previous answer must retain original context and results. Native charts require real SDK execution and exact read-back, not a success message.
- Genuine acceptance stays inside the actually valid existing Sol/medium policy and remaining allowance. Recover the previous release's uncertain live-check/cleanup outcome before assuming another disposable browser or any unused portion of the eight-question/16-attempt limit is available.

## 5. Implementation sequence and acceptance gates

These are dependency gates in one approved delivery project, not separate calendar commitments or repeated routine design approvals.

1. **Establish the baseline.** Restore availability of the repository-pinned Node/pnpm toolchain and pass the workspace guard. Reconcile the previous release's exact source/build, CI, live-AI result, disposable-browser cleanup and rollback evidence; documentation currently lags the historical reported release. Inspect actual authorization/expiry before later live operations.
2. **Deliver the first vertical slice.** Care → real available finding → exact dated product/source → North follow-up → return to the original result. Add the header/default route and move the working library to Purchases. Prove Light/Dark, narrow-screen, keyboard and history continuity before extending all workflow types.
3. **Complete the typed Care domain and workflows.** Add the projection, new domain-rule tests, persistence/migration proposal, comparison/watch, return, refund, warranty and care details. Test unavailable, conflicting, duplicate, stale and partial records. Obtain exact persistence/worker activation approval at that boundary; never silently replace durable scope with decorative cards.
4. **Integrated acceptance.** Run formatting, lint, types, unit/domain and dedicated-PostgreSQL tests; fixture/database browser journeys, accessibility, mobile/desktop and Firefox/WebKit coverage; North recovery/access and native Insights regressions. Inspect deliberate new visual baselines. Verify genuine North separately within remaining valid authority.
5. **Release and handoff.** Update STATUS/README/API/design/navigation documents to actual implementation and evidence. Commit/push; require all three existing mandatory CI jobs on the exact commit. Preserve a verified working rollback, coordinate bounded stop/build/start without overwriting running `.next`, deploy privately through **8444 → 127.0.0.1:3002**, and perform actual HTTPS smoke checks. Critical regressions trigger application-assets/config rollback, never data/accounting/authorization rollback.

### Required acceptance journeys

- Care opens by default; Purchases keeps search, All documents and old dated Twin/document links; Insights retains genuine native filtering/chart execution.
- An exact-product price comparison distinguishes observed savings from refundable eligibility; an unsupported purchase cannot start a false active watch. An activated supported watch demonstrates a real successful check, repeated-run deduplication and truthful stale/error status.
- A return timeline survives reload under the approved persistence path; manual and external milestones remain visibly distinct. A return arrival never creates a refund. Partial, pending, failed and unknown refunds never become full completion.
- Warranty unknowns remain unknown, explicit dates retain their evidence, and calculations cover date boundaries/time zones. Existing fictional goods never acquire real coverage.
- Exact-product care opens the correct source. A missing manual cannot borrow another model's guide; a possible recall remains uncertain.
- Care question → exact purchase → receipt → native chart → care source → previous answer works without duplicate POSTs, context loss or replay. Existing receipt → totals → Only Audio → chart continuity remains covered.
- Keyboard focus, status announcements, reduced motion, 320px reflow, 200% text and both themes pass. Browser emulation is reported separately from human/real-device review.
- Direct HTTPS navigation/reload and read-only views are checked on the promoted exact build; final live URL is **https://greatbison.tail9e8802.ts.net:8444/dashboard**.

### Faster execution without weaker checks

Freeze the state/provenance contracts first, test domain rules with deterministic examples, then run focused affected journeys during development. Use one coordinated integrated verification window on frozen code and one candidate build where the existing tooling permits. Keep the three mandatory CI jobs parallel with unchanged coverage, thresholds and retry policies. Repeat broad checks only after relevant fixes or unresolved failures. Retain failing artifacts and measure actual elapsed times; no speedup is claimed in advance.

## Approval and current handoff

- **Implemented:** Care/Purchases navigation, read-only Care projection/details, return enquiry preparation and model-planned Care read tools are under integrated verification. See STATUS for results, not this proposal.
- **Verified:** official research and baseline inspection; original planning-only state is historical. The existing approved Node/pnpm installation now works through its pinned toolchain path. Current code tests, actual application and exact-commit CI are separately tracked in STATUS.
- **Incomplete:** durable new tracking/warranty/watch implementation and activation; final integrated acceptance, genuine AI and release. Prior release's final live-AI/cleanup/preservation outcome is not reconciled here.
- **Blocked:** release verification still gates the exact conditionally approved Care rollout; existing records do not supply general live returns/warranty coverage.
- **Next:** finish frozen-source verification and exact-commit CI, then complete the approved persistence, acceptance and private-release gates without routine reapproval. No new money, paid API credits, allowance renewal/reset, financial execution, license activation or public exposure is included.

External constraints remain **November 12, 2026, 12:00 PM PST** submission cutoff and judge access through **December 15, 2026**. Record actual authorization/license expiries when verified; neither date extends them or replaces acceptance gates.
