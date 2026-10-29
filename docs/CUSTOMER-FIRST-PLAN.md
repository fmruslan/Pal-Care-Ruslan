# Customer-first capability plan

## Purpose and decision rule

**Pal Care makes a saved purchase useful after checkout.** The customer should understand their own purchases, find the right receipt, explore available documents/care and see recorded price-adjustment outcomes without managing an administrative workflow. **Customer Intelligence is the primary analytics experience; merchant investigation is not this plan's objective.**

This is the approved **scope and acceptance sequence**, not a release claim or calendar engineering schedule. [STATUS](STATUS.md) remains the source of truth for what exists and which evidence has passed. The checklists define evidence to assemble/reuse; unchecked items here do not revoke earlier acceptance or replace the status ledger. Earlier stage numbers and dated evidence remain valid history where not explicitly superseded.

Progress through **A Customer Intelligence foundation → B CareOS-controlled personal analytics → C unified customer experience → D complete acceptance → E readiness** by satisfying the gates below. Work in testable vertical slices; reuse accepted capabilities rather than rebuilding them. Necessary work may cross a dependency boundary, but a later capability is not accepted while an earlier prerequisite is unresolved. No arbitrary feature count or intermediate engineering date determines completion. Existing resource, security and authorization limits remain mandatory; they are not product-scope caps.

For each slice record: customer outcome, current gap, owned files, prerequisites, acceptance tests/evidence, external approvals and the next gate. Explicitly distinguish implementation work that can proceed now from activation that cannot.

**Current delivery boundary:** customer `/insights`, native Studio widgets and customer-control code are under active engineering and **pending integrated verification**, not shipped/accepted on the strength of this plan. Existing private CareOS/merchant-Studio model evidence is real but does not accept the new customer analytics path. [Actual private AI evidence](evidence/SUBSCRIPTION-QUALITY.md) · [status](STATUS.md).

## A — Customer Intelligence foundation

**Outcome:** the customer has a useful, read-only `/insights` workspace over their saved Purchase Twins, not a reskinned merchant dashboard or another security-cutover project.

- Build the fixed fictional customer's typed, server-loaded purchase/document/care/activity/adjustment projection on the existing monolith and restricted reader. Preserve snapshotted purchase amounts/identity; current catalog prices are not amounts paid. Reference placeholders remain unavailable amounts, not free goods or market prices.
- Establish the views **My Purchases**, **Documents & Care** and **Price Adjustments**. Use **native AG Studio grid, chart and KPI/value widgets** alongside **custom documents/care, attention/next-step and adjustment-evidence widgets**. Do not replace native analytics with only custom cards.
- Connect widgets through the real Studio data engine and cross-filters, with visible page/filter scope, an accessible source-record summary and exact Twin/document links. Empty selections stay empty; a missing dependency never means no issue, no recall or no adjustment.
- Provide useful add/move/resize, save/restore and reset layout controls, with strict known widget/page/position validation and browser-local persistence. Layouts cannot inject data, links, SQL or trusted facts. Keep the vendor's original license notices/watermark and local-evaluation gates.
- Preserve Sample versus Verified Sandbox evidence throughout charts, grids, KPIs and custom widgets. Describe the actual loaded purchase window, not universal history/lifetime spending. Adjustment totals include only matching independently verified recorded refunds; proposed/approved/pending/illustrative values never become money recovered. Missing/partial evidence is visible.
- Reuse accepted security foundations: no new database/framework/customer login, broader role, migration or provider activation. Original checkout snapshots/keys/deadlines, capture identities/attempts, Twins/documents/policies/events, Guardian records and AI reservations remain untouched. Database failure is visible, not fixture fallback.

**Acceptance gate A**

- [ ] `/insights` loads the correct fixed customer dataset in each supported mode and offers all named views; native grid/chart/KPI and custom evidence widgets display consistent scoped records.
- [ ] Real chart selection cross-filters the other widgets and their row/count/aggregate/source evidence correctly; clear/reset removes the intended selection without broadening an independently active filter or silently replacing zero results.
- [ ] Add/move/resize/save/restore/reset work through Studio; invalid layouts are rejected without changing current state. Direct layout, theme and navigation controls issue no financial request or automatic model request; an explicit authorized CareOS analytics prompt may invoke planning.
- [ ] Domain and browser regressions verify provenance, deduplication, bounded-window scope, unavailable amounts, source coverage and verified-only adjustments. Dedicated database evidence uses an explicit `TEST_DATABASE_URL`; existing application records/schema/capabilities are preserved.
- [ ] Native analytics and the accessible record summary remain useful under keyboard/narrow-layout use and an explicit unavailable/local-license state. No customer-foundation claim rests on the earlier merchant-only implementation.

## B — CareOS-controlled personal analytics

**Outcome:** the customer asks CareOS an ordinary question and sees the correct personal Insights view change, with inspectable saved evidence—not a merchant-investigation detour or an unverified tool-success message.

- Keep one customer CareOS host and Glance/Tap/Talk. Direct receipt/fact/navigation tasks stay deterministic where useful. Personal analytics requests can select a view, filter by supported saved attributes, show a category breakdown, find matching purchases/documents, focus evidence or add a permitted widget.
- Route customer Insights planning through the protected, context-scoped path and genuine Studio Agent Framework execution. Retain existing scope/Origin/conversation/fingerprint/lease checks; use only this customer's saved purchase/adjustment projection, not merchant-wide datasets/operator tools, and do not leak customer history into merchant planning. The model proposes bounded presentation commands, not arbitrary code, SQL, URLs, record identities or financial amounts.
- Execute actual schema/page/presentation tools and check their returned results and SDK state. Read back the exact intended state **and** check the rendered data outcome before telling the customer the operation succeeded. Telemetry, emitted tool events or a fluent model answer are insufficient.
- Preserve the original question and selected dated purchase through disambiguation, follow-up, navigation and uncertain recovery. Receipt links are application-resolved from the exact Twin; multiple matches require explicit customer choice. Missing manuals, uncertain product identity and pending status remain explicit.
- **Useful new real Sol Medium calls are authorized now within the existing unexpired session and its remaining allowance/accounting.** Before dispatch verify the actual session/window/usage; keep the same identity, journal, prior attempts and unknowns. Stop on expiry, exhaustion, provider denial or accounting uncertainty. No new allowance/reset/renewal, paid credits, model/API fallback or migration is authorized. Use real inference where it adds acceptance value, not to inflate call counts.
- Label deterministic, fixture/scripted, private subscription and separately gated API modes honestly. Private subscription/legacy merchant-Studio acceptance is not acceptance of new customer commands, public licensing or the final API-key path. CareOS cannot approve/refund/pay, rewrite policy/status or assert unsupported safety/coverage/savings.

### Exact SDK postconditions required for B

These are acceptance requirements, **not claims that the in-progress code already meets them**. Compare normalized expected state with `AgStudioApi.getState()` and verify visible scoped records/aggregates after execution.

| Customer operation | Required observed postcondition |
| --- | --- |
| Select My Purchases / Documents & Care / Price Adjustments | Exact `selectedPageId` (`purchases` / `documents` / `adjustments`), intended page widgets and explicitly defined predicate. A documents/care/attention/verified-adjustment request applies its specific saved-record predicate, not just a new title. |
| Apply date/category/provenance/search filter or native chart cross-filter | Exact intended field/operator/value in page filters/cross-filter state; resulting purchase IDs, grid rows, KPI denominator, chart values and custom evidence agree. Independent filters compose correctly. No stale hidden cross-filter or empty-to-all fallback. |
| Show verified adjustments | Only exact-Twin, independently verified recorded refunds contribute to the displayed USD amount/count. Read-back selected records and displayed total match the deterministic projection; zero/unavailable/pending remain distinct. |
| Add a native or custom widget | Stable known widget ID appears exactly once with the expected widget type, dataset/field mappings, aggregation and valid layout on the intended page. Repeating the same addition is idempotent, not a duplicate or wrong-page success. |
| Focus category/evidence | Exact page `selection` type and existing widget ID match the request; the widget is visible/reachable and retains the intended purchase/filter context. |
| Move/resize, save/restore, reset | Known pages/widgets have exactly the validated normalized `widgetLayout` positions/dimensions. Restore changes layout only; reset restores the declared default page/widgets/layout/filters/cross-filters, not source records or quotas. Invalid restore leaves current state unchanged. |
| Unsupported, failed or cancelled operation | No prohibited command/tool runs and no success claim is emitted. Cancellation stops remaining tools; any already-applied browser state is described honestly, not falsely rolled back. Failed/unknown model requests replay saved results without redispatch or budget recovery. |

**Acceptance gate B**

- [ ] Natural requests for purchases, category breakdowns, documents/care, attention, verified adjustments, evidence, matching receipts and layout/widget changes satisfy the exact postconditions above. Unsupported/consequential/injected requests remain refused.
- [ ] Real SDK tool execution, state read-back and visible outcomes are evidenced separately from model plan output, scripted fixtures and injected HTTP tests; actual customer-path Sol requests pass within existing valid authority.
- [ ] Customer/merchant/purchase context and protected scopes remain isolated; replay/cancellation/reload/unknown outcomes retain identity, history and consumed/reserved usage. No tool changes financial/merchant records.
- [ ] Genuine model answers/plans are reviewed for meaning, task correctness and source applicability, not quote/schema presence alone. The new customer route is not accepted using only older merchant-Studio evidence.

## C — Unified customer experience

**Outcome:** the customer understands their purchase and can complete a useful task without fighting navigation, crowded dashboards or a fragile assistant.

- Make **Home (`/dashboard`) / Purchases (`/vault`) / Insights (`/insights`) / Documents (`/documents`)** the coherent customer navigation on desktop and mobile. Demo shop, Guardian, safety and replacements remain contextual/secondary destinations; do not make merchant investigation the customer's analytics entry point.
- Apply the owner-approved Blue / Saffron / Deep Purple identity and shared semantic System/Light/Dark design across Home, Purchases/Twins, Insights, Documents, care, safety/replacements and checkout states. [ADR 0010](adr/0010-blue-saffron-purple.md) supersedes the former Blue/Lavender color assignment; preserve the working architecture and acceptance gates. Follow [DESIGN](DESIGN.md).
- Give the Purchase Twin, relevant facts and the next useful action a clear hierarchy. Keep one persistent customer assistant, readable long answers, visible submitted questions, explicit purchase confirmation and accessible source/detail disclosure.
- Verify keyboard/focus, touch targets, responsive reading space, text enlargement, reduced motion, contrast, mobile keyboard/IME and failure/recovery states. Appearance remains browser-local, never authorization or a reason to remount checkout.
- Include owner feedback before declaring the customer UX accepted or frozen. A screenshot, generated mockup or agent preference is not customer approval.

**Acceptance gate C**

- [ ] Home → Purchases/Twin → Insights → matching receipt/document/care and back feels like one product, with the same four primary destinations, context/provenance/status wording and persistent CareOS. No dead ends, hidden essential content or unnecessary chat dependency.
- [ ] Light/dark/System, keyboard, mobile/narrow layouts, long-answer reading, pending/error/empty states and enlarged text pass functional and visual review. Direct presentation changes issue no financial or automatic model requests; explicit authorized CareOS analytics prompts remain permitted.
- [ ] Owner review and remaining human/real-device observations are recorded explicitly. Cross-engine mobile emulation and injected keyboard geometry are not real-device certification.

## D — Complete acceptance

**Outcome:** an owner or reviewer can repeat the important customer tasks and tell exactly what was proved.

- Agree on an integrated verification window after shared edits settle. Run the existing lint, format, typecheck, unit, deterministic/offline, build, dedicated-PostgreSQL, browser/accessibility, failure and focused compatibility/protocol suites as relevant; do not run them concurrently against shared mutable build/database state.
- Verify GitHub Actions for the **exact integrated commit**, recording run URL, SHA, conclusion and relevant counts. Diagnose genuine failures before editing coordinated CI/test files. A previous green SHA, retry, skipped stage or local success is not the new commit's result.
- Exercise the complete customer journey and all three Insights views: find the intended receipt, select the correct dated purchase, inspect source-backed care/status, use native cross-filters/KPIs and custom evidence, add/change/restore layouts, continue/recover safely and inspect the exact recorded adjustment outcome. Validate any related merchant view separately, not as a substitute for customer acceptance.
- Keep isolated fixture/injected-provider proof, actual application checks, genuine provider acceptance and owner/independent human feedback separate. Preserve initial failures and corrections rather than replacing them with final success.

**Acceptance gate D**

- [ ] Relevant integrated suites pass with no unexplained failures/skips; exact-SHA CI and reproducible commands/results are recorded. Existing green `9f169e8` is a baseline, not verification of new customer code. Later edits require appropriate re-verification.
- [ ] Actual application acceptance uses the intended configuration and demonstrates all A–C customer capabilities, exact SDK postconditions, genuine customer-path Sol planning within the still-valid allowance, scope isolation, history/usage preservation and truthful recovery. Human/real-device and semantic review limits are identified.
- [ ] Claims in the README, status, architecture, API and judging guide match the evidence. No synthetic payment/refund, scripted planner or fixture response is promoted to genuine external proof.
- [ ] Remaining gaps are marked incomplete or blocked, with the next evidence/approval required; passing automation alone does not close external or human gates.

## E — Readiness

**Outcome:** judges can access a coherent, truthful demonstration for the required period without exposing private authority or depending on an expired permission/license.

- Prepare owner decisions for public OS/runtime isolation, provider modes/budgets, actual financial acceptance, licensing and Render deployment separately. Preparation is engineering work; activation requires exact approval and actual verification.
- Real Price Guardian refund/recovery acceptance, Channel3 responses and public HTTPS webhook delivery (if implemented) each require their own authorized proof. Existing capture evidence does not prove a refund; one CPSC notice does not prove comprehensive monitoring. Never create a new payment or reset an unresolved operation to bypass a failed gate.
- Final API-key acceptance remains a separate approved integration gate: credential/project/hard-limit confirmation, migration approval where needed, bounded real requests, usage reconciliation, semantic/source review and actual Studio execution. Subscription success or proposed dollar limits do not authorize API spending.
- Establish the intended public AG Studio feature/license coverage through judging, including the native grid/chart/KPI and Agent Framework feature set actually used, keeping vendor notices intact. Prepare judge access, truthful customer-first demo narrative, source/setup/license disclosures, evidence and the required public video; do not imply an undeployed URL is available. [Judging and sponsor evidence](JUDGING.md) · [integration matrix](INTEGRATIONS.md). No Render Workflows expansion is authorized by sponsor strategy.

**Acceptance gate E**

- [ ] The owner has separately approved each activated financial/provider, paid-credit, migration/credential, license and deployment capability, with exact scope, limits, expiry and stop conditions.
- [ ] Actual public isolation, configuration, HTTPS access, secret exclusion and intended bounded model/provider behavior pass after authorized deployment; local readiness or CI alone is insufficient.
- [ ] Appropriate AG Studio licensing and hosting/funding/access cover **December 15, 2026**; any trial expiry or renewal dependency is resolved and recorded, not assumed.
- [ ] Submission materials describe only accepted behavior and clearly disclose incomplete/excluded workflows. If an external gate cannot close, ask the owner for a scope/submission decision rather than silently waiving it or claiming eligibility.

## External dates and expiring permissions — not an engineering calendar

| Constraint | Required handling |
| --- | --- |
| Conservative submission cutoff | Preserve **November 12, 2026 at 12:00 PM PST** as the operating cutoff; do not assume a later time. [Official rules](https://paypalaihackathon.devpost.com/rules) and [judging guide](JUDGING.md) remain references. |
| Judge access | Working access, hosting and applicable license coverage must extend through **December 15, 2026**. |
| Current private owner window | Latest recorded approved expiry is **`2026-10-29T22:10:58.310Z`**, with a historical snapshot of **28/50 requests used, two unknowns retained**. The owner now permits useful fresh Sol Medium inference **within the existing actually unexpired session and remaining accounting**. Read the actual current state before dispatch; do not treat this snapshot as live permission/counts or renew/reset it. See [private access evidence](evidence/PRIVATE-ACCESS.md) and [subscription contract](SUBSCRIPTION-DEVELOPMENT.md). |
| Short-lived scopes/approvals | Preserve each actual absolute expiry, request/session identity and unknown reservation. Restart/reconnect, transcript cleanup or a plan update cannot extend permission or replenish usage. Owner renewal is a separate action. |
| AG Studio license/trial | Public/judging coverage is not established by local unlocked evaluation. No activated trial expiry is recorded; obtain and verify actual terms/feature coverage through judging. A 45-day trial started in October may expire too soon. |

The old **November 5** acceptance recommendation in [OFFLINE-AI-REVIEW](evidence/OFFLINE-AI-REVIEW.md) is retained only as historical wording and is **superseded, not an active target**. Do not add intermediate calendar engineering commitments to replace it. Preserve existing observation timestamps, authorization/license expiries and official event constraints.

## Authorization boundaries

Engineering and approved agent coordination may implement scoped code, tests and documentation. The owner's current direction also authorizes useful real Sol Medium inference **within the existing unexpired session/remaining allowance and unchanged accounting**; it does not require separate approval for every useful call inside that exact authority. Verify the live grant and preserve all attempts/unknowns. This documentation-only slice makes no inference calls. The following boundaries still require separate approval:

| Boundary | Separate owner decision/evidence required |
| --- | --- |
| Financial operations | Exact Sandbox purchase/capture/refund/reconciliation scope and stop conditions; no production money movement. Existing experiment permission is not reusable authority for another purchase/refund or the pending eCheck. |
| Paid APIs, credits and changed inference authority | New API project/key/billing, paid credits/fallback, additional allowance, replacement/reset session, identity rotation or expiry renewal are **not** authorized. Useful fresh Sol Medium calls under the existing valid session are authorized as above; preserve its journal and prior unknowns and stop on exhaustion/expiry/denial. Subscription success does not activate API-dollar billing or 0016. |
| Application database changes | Credential provisioning, role grants and reviewed versioned migrations require separate approval/recovery safeguards. No application schema-push, reset, seed or web-service migration. Disposable dedicated-test DB evidence is not application migration approval. |
| License/trial activation | Owner-controlled account, actual product/features, terms/cost and expiry through judging; never bypass notices or treat the project's MIT license as a vendor license. |
| Deployment/public exposure | Owner account/billing approval, effective OS/runtime isolation, restricted secrets/DB roles, exact origin, intended provider gates and real post-deploy acceptance. No public exposure of the owner-only subscription preview. |

No deadline, failing test, missing permission or future plan item relaxes these boundaries. Report the blocked gate and safe next action instead.

## Required handoff and progress report

Every slice reports the same sections:

1. **Implemented:** exact behavior/files changed; distinguish preparation from activation.
2. **Verified:** isolated-test results/commands; actual-application observations; exact-commit CI SHA/result/URL; genuine provider evidence separately. State limits and unrun checks.
3. **Incomplete:** acceptance criteria or approved scope not yet delivered; never relabel them shipped.
4. **Blocked:** external/owner/human/license/isolation dependencies, affected gate and why current authority cannot resolve them.
5. **Next:** the next customer outcome/gate, acceptance evidence and owner decision needed, without an invented engineering date or arbitrary feature cap.

This document records approved scope and gates; it does not accept the new customer code. Main-agent integrated results must establish implementation, isolated checks, actual customer/SDK/model acceptance and remaining blockers separately. This documentation-only slice performs no build/test, inference/provider call, migration, license activation or deployment and does not itself close a capability gate.
