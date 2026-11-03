# North ☆ — approved assistant update plan

**Historical staged-delivery plan:** the owner approved [continuous full makeover execution and a new 200-genuine-test campaign](NORTH-FULL-MAKEOVER-PLAN.md), replacing routine 1A/1B/2/3 owner stops while retaining this technical direction and all genuine separate authorization boundaries. The staged instructions/evidence below are history, not current approval stops. New campaign progress starts at 0/200; original provider accounting/unknowns are never reset. The working preview remains unchanged until final replacement approval.

**Status: direction and three-slice roadmap approved with final owner refinements. Checkpoint 1A is authorized; 1B and later implementation await the owner's 1A review approval.**

Prepared: **2026-11-02**; updated before implementation with the owner's final approval. Reviewed baseline: **`47f62048b8e820d81078c0c575efb0b3f15aa005`**, primary `main` checkout. **North ☆**, pronounced **North Star**, is Pal Care's intelligent assistant, not a separate product or competing brand. **Pal Care remains the primary product identity.** Approval of the plan is not acceptance of implemented behavior. [STATUS](STATUS.md) remains implementation truth.

## Recommendation

**Make the question the entry point. North ☆ finds the right saved records, explains the scope, and presents the answer in the useful format.**

One persistent customer conversation should handle a purchase library, one dated purchase, documents and personal analytics. Reuse the Purchase Twin, receipt/source evidence and existing native Insights workspace. Preserve **Home / Purchases / Insights / Documents** and the Insights views **My Purchases / Documents & Care / Price Adjustments**. **North should understand what the user wants without making the user understand how North works.**

Deliver through [the existing A–E acceptance sequence](CUSTOMER-FIRST-PLAN.md): **A Customer Intelligence foundation → B assistant-controlled personal analytics → C unified customer experience → D complete acceptance → E readiness**. The slices below can cross implementation dependencies, but later gates cannot be accepted before their prerequisites. There are no intermediate calendar commitments.

## What the implementation actually needs

| Observed baseline | Implication for this proposal |
| --- | --- |
| `src/components/careos/provider.tsx` mounts one assistant, but `pathname === "/insights"` switches its conversation, send and recovery handlers. | Unify the visible customer timeline and task dispatch. A new header alone cannot provide one conversation. |
| `src/lib/careos/tools.ts` sends nearly every supported non-identity request without a Twin to purchase selection. `how much` becomes a selected-purchase summary. | Resolve library intent before single-purchase rules. A global total must never quietly become the selected item's price. |
| `src/components/careos/purchase-choices.tsx` requires radio selection plus Continue and retains inactive controls. | Replace the blocking flow with a dismissible context control and small, actionable clarifications. |
| `src/lib/intelligence/customer-model.ts` already validates fixed-scope purchase/document provenance, deduplicates records and exposes unavailable amounts and evidence. | Extend this foundation rather than creating another data model. It covers the newest 100 saved Twins, not complete PayPal history. |
| Native Studio already has grids, a category **count** chart, a count KPI, custom evidence, cross-filtering and local layouts. | Reuse these. Monetary KPIs/category-value charts are additional work; existing count widgets are not spending analysis. |
| Subscription-mode conversation endpoints and the composer check AI access before deterministic resolution. | Add an explicit provider-free saved-record query boundary. Merely relabeling the disabled composer cannot deliver saved-data fallback. |
| Per-request identity, recovery, exact-source care and SDK postconditions already have implementation and historical evidence. | Carry these contracts into the redesign and test the new combined journey. Historical acceptance does not accept the proposed behavior. |

Source review also covered the [product](PRODUCT.md), [architecture](ARCHITECTURE.md), [security](SECURITY.md), [CareOS](CAREOS.md), [Insights](INTELLIGENCE.md), [API](API.md), ADRs [0002](adr/0002-public-render-demo.md)/[0003](adr/0003-sandbox-checkout.md), and current [Bronze / Violet identity](design/BRONZE-VIOLET.md)/[ADR 0011](adr/0011-bronze-violet-identity.md). Installed Node **22.23.4**, Next **16.4.2**, React **19.3.1**, AG Studio **3.0.0** and Zod **4.6.7** support the proposed extension.

## 1. Identity and visual direction

- Display **North ☆** in the assistant, launchers, contextual actions, briefings, current product copy and new assistant self-introductions. Labels: **Ask North ☆** and **Explore with North ☆** where appropriate. Remove assistant “Powered by” branding/attribution; do not replace it with “Powered by North.” Keep Pal Care primary.
- Give the lockup an accessible name of **North Star**; avoid a screen reader announcing a decorative star separately. Use a consistent outlined five-point star matching **☆**, rather than a new unrelated sparkle mark.
- Keep the current bronze Pal Care / violet assistant identity, Inter typography, neutral inputs/answers and owner-approved charcoal/slate dark surfaces. Use violet for the North mark, focus and selected controls, with less tinted header area.
- Keep implementation identifiers such as `careos`, existing API paths, cookie/storage keys and environment variables compatible. Brand replacement concerns current visible copy and model identity; historical transcripts, evidence, provider IDs and accounting retain their original values. Update current docs with a clear “formerly CareOS” mapping instead of rewriting historical evidence.
- Audit accessible labels, empty/error states, model identity prompts, metadata and secondary visible references as well as the main chat title. Centralize the display name to prevent future inconsistencies.

### Compact presentation and discovery

```text
North ☆                       Expand   ⋯   Close
Purchase context ▾            [or: No purchase selected]
───────────────────────────────────────────────
What would you like to know?
Explore purchases, receipts, recorded value or care.

[Four optional discovery suggestions, below]

        One scrolling conversation
        Lists / result cards / source disclosures
───────────────────────────────────────────────
Ask about your purchases…                 Send
```

Keep a compact header, one transcript scroll region and a pinned, prominent composer. A new conversation shows exactly four optional suggestions, collapsing when the conversation begins:

1. **What did I buy in the last three months?**
2. **Show my recorded purchase totals.**
3. **Find purchases with receipts.**
4. **Help me care for a product.**

They are shortcuts, never mandatory workflows. Availability is honest: library answers are not implemented by their labels. During 1A the first three introduce the upcoming capability without sending an unsupported purchase-specific request; 1B/Slice 2 connect them to their accepted query paths. Move usage/account administration into the overflow menu; show concise actionable availability feedback beside the composer when relevant. Each result still distinguishes **Saved records · no model call**, scripted demo, or actual model assistance.

Expand/collapse are two presentations of the same assistant and preserve conversation, draft, filters, persistent context, question scope, results and navigation context. Analysis uses the existing `/insights` workspace as its wide results surface, with conversation alongside it on desktop and an accessible stacked/full-screen arrangement on mobile. Keep one active native Studio instance; do not copy its dashboard into a second analytics implementation. Text/list answers stay where asked; **Open in Insights** or a clear chart/view request reveals the larger workspace in Slice 2. Opening, resizing or changing appearance alone never invokes a model or creates another conversation.

## 2. Separate persistent context from per-question scope

**Persistent product context** is the purchase currently viewed or explicitly selected. It remains available until the user changes/removes it. **Per-question scope** is the set of records needed for one answer: all saved purchases or one purchase. Infer unambiguous scope without permanently replacing the selected product. Each answer displays its effective scope with a correction path. Clarify only when reliable resolution is not possible.

| Situation | Proposed North behavior |
| --- | --- |
| Fresh conversation opened from Home, Purchases or Documents | No forced product selection. Library questions use **All saved purchases**, with the actual loaded count/window visible. Reopening an existing conversation keeps its explicit context and draft. |
| **Ask North ☆** on a purchase | Focus that exact dated Twin and show date, Sample/Verified Sandbox and identifier. Opening only selects context; it does not send a prompt. |
| Open the context control | Small searchable popover/sheet with **All saved purchases**, dated purchase matches, Close/Cancel and keyboard support. Selecting changes focus immediately; there is no separate Continue button. |
| Clear the purchase chip | Remove persistent product context while keeping conversation and draft. |
| Ask a clearly library-wide question while focused on headphones | Resolve the library query, show **Searching all saved purchases** and the effective filters, **retain headphones as persistent product context**, and offer scope correction without automatic replay. This query path is 1B+, not a 1A capability claim. |
| Ask “How much did I spend?” with a purchase selected | Ask only **This purchase or all saved purchases?** If already in library scope, answer the labeled recorded-value total without an unnecessary scope question. |
| Ask for a receipt and several dated purchases match | Show compact choices. One click on a current clarification explicitly selects and answers the original request once, after server validation; no second confirmation step. Ordinary context selection never auto-submits. |
| Type a different question while a picker/clarification is open | Dismiss the unfinished choice and prioritize the new question. Earlier choices become a concise historical note rather than dead form controls. |
| Navigate among customer pages | Preserve timeline, draft and explicit selection. Page context is a default/suggestion, not permission to overwrite an explicit scope or pending request. |
| Follow up with “only Audio” or “as bullet points” | Apply it to the last applicable result, retaining its date/provenance scope. Formatting-only requests reuse that saved result without unnecessary data retrieval or inference. A new explicit library question starts its declared scope; unrelated old filters must not silently constrain it. |
| Choose **New topic** | End the current topic without deleting earlier entries or saved records. Do not implicitly remove persistent product context; provide its separate Remove control. Existing retention/turn limits still apply; transcript deletion is separate. |

Every answer carries its own effective scope and record snapshot. Changing current context never relabels an old answer or mixes another purchase's receipt/manual into it. Duplicate product names remain distinguishable by date, provenance and Twin identity. The existing explicitly labeled reference-only recall example also retains its separate semantics.

**An unfinished choice and dispatched work are different states.** The composer remains editable during work. Stop/correction cancels remaining presentation actions where possible; an already-dispatched request retains its identity, reservation and bounded server lease. A replacement is a distinct explicit request when admission allows it. Superseded results must not steal focus, overwrite the new scope or execute stale view changes. Uncertain work is reconciled by saved-result reads, never automatically resent or marked undone. Recovered Studio plans still require **Apply saved view** and fresh read-back.

## 3. Answers shaped to the question

| Request | Output and evidence |
| --- | --- |
| “Show everything I purchased in the last three months.” | Matching saved purchases with the exact interpreted date range, loaded-window limitation, dates, provenance and direct Twin links. No purchase picker. |
| “List those in bullet points.” | Real bullets using the same result set, with purchase links and **Copy list**. Requested format takes priority over default cards. |
| “Which products have receipts?” | Receipt-presence query and linked receipt/purchase rows. A care card or policy alone does not count as a receipt. |
| “How much have I spent on electronics?” | Deterministic totals by provenance, priced/excluded record counts, currency and category scope; a native value/category view when requested. |
| “What are my spending patterns?” | Recorded-value/category/date summary from the same computed facts. Distinguish descriptive observations from trends the loaded history cannot establish. |
| “Help me take care of my headphones.” | Exact-product guidance and sources, or a clear missing-manual result with available documents. Keep the working product-care path. |

### Data rules for trustworthy analytics

1. Use snapshotted purchase amounts in integer minor units. The model may interpret a question and explain supplied calculations; it cannot supply totals, record identities, links or arbitrary queries. Format currency only after calculation.
2. Show **Sample purchase value** and **Verified Sandbox purchase value** separately, including in chart series/KPIs. Neither is real personal spending. Reference/unpriced items are counted explicitly and excluded from monetary totals; the Raspberry Pi zero placeholder is not a free purchase.
3. Deduplicate by validated record/payment identity, not product name. Two legitimate headphones purchases remain two purchases. Conflicting evidence is unavailable, not an arbitrary winner.
4. Show original recorded value and independently verified recorded adjustments separately. Pending/proposed refunds do not reduce a total. Do not claim net lifetime spend or that external refunds/history are complete. Current supported amounts are USD; unsupported currency is explicit rather than silently converted or summed.
5. Relative dates use a captured reference date and declared display timezone. Recommend **last three months = rolling three calendar months through today**; **last month = the previous complete calendar month**. Echo the exact range and let the user edit it. Stored date-only purchases retain their calendar dates. Test month ends, leap days and timezone boundaries.
6. Use a small reviewed category alias map: for the current catalog, **Electronics → Audio + Computing**, displayed as that interpretation. Unknown categories receive a minimal clarification; do not invent categories or rely on free-form model classification.
7. List, bullet, totals and chart outputs share the same normalized filters and matching record IDs. A zero-match filter stays empty. Missing dependencies stay unavailable, not zero or “no problem.” Simple receipt/list reads do not depend on unrelated recall/adjustment services.
8. Always disclose the actual loaded window (currently newest 100 Twins), source mode, selected period and unavailable/excluded counts. A model's bounded prompt sample is not the dataset used to compute totals. Never infer complete account history from a small loaded library.

## 4. Engineering approach

```text
Question + current explicit context + requested format
                         ↓
Bounded task/scope resolver
                         ↓
Validated saved-record query / existing exact-product care /
existing protected customer Insights planner
                         ↓
Typed result with scope, filters, record IDs and provenance
                         ↓
List / bullets / cards / sources / native Insights presentation
```

- **One customer coordinator:** extend the existing root host rather than adding another chatbot. Own the draft, topic, visible timeline, active result and request lifecycle above route changes. Adapt the existing care and customer-Insights services into that timeline while retaining their separate server ownership, request identities and authorized histories. Restore saved turns through their original owned reads; client-combined history is never trusted model context. New topic establishes a follow-up boundary, not a call to the existing destructive Clear handlers. Merchant history never enters this coordinator.
- **Intent before purchase selection:** distinguish list, aggregate, document search, product care, view change and clarification before invoking the existing single-Twin resolver. Natural-language interpretation may use the existing authorized model when needed; common structured questions must have a deterministic path. Route by the request, not by the current URL.
- **Provider-free saved records:** introduce a narrowly typed records-query adapter over the existing public fictional read projection. Retain exact Origin where required, bounded inputs/rates, scope validation and ownership/retention for persisted conversations. Keep private inference/transcript access protected: do not simply remove `assertCustomerRuntimeAccess` from existing endpoints. Unsupported offline language offers supported filters/actions without dispatching or renewing AI.
- **Shared query/result contract:** extend strict schemas with library/purchase scope, supported filters, requested output and typed result metadata. Validate all client hints server-side. Additive versioned result fields can use existing JSON storage if restore/fingerprint compatibility is proved; no application migration is assumed authorized. Keep historical requests readable and their original fingerprints intact.
- **Real native analytics:** reuse the pinned Studio data engine and custom evidence widgets. Add the needed minor-unit value metrics and bounded date/category/receipt predicates. The current three-command planner cannot express every combined request; design a validated query specification/atomic presentation mapping rather than dropping filters or opening an unbounded tool loop.
- **Exact execution evidence:** after each view action verify the selected page, all filters/cross-filters, widget ID/type/data mappings/aggregation, layout/selection and resulting record IDs/rows/counts/amounts. Report success only when SDK read-back and rendered results agree. Empty results, cancellation, local-license unavailability and failed execution have honest states.
- **Grounded explanations:** model explanations receive computed facts and coverage limits, with relevant same-task/same-product context. All displayed numbers/links come from application results. Preserve reviewed exact-source care; do not broaden access to documents, payments or arbitrary web tools.

### Expected file ownership

| Area | Primary existing files/locations |
| --- | --- |
| North shell, scope and timeline | `src/components/careos/provider.tsx`, `purchase-choices.tsx`, `use-conversation.ts`, `conversation-client.ts`, existing scroll/viewport hooks; focused new scope/result components alongside them |
| Task/query/result contracts and brand identity | `src/lib/careos/contracts.ts`, `tools.ts`, `service.ts`, `role.ts`; focused shared query/display-name modules |
| Saved-record and model boundaries | `src/lib/careos/runtime.ts`, `src/app/api/careos/`, existing store/security helpers and narrowly scoped records adapter |
| Analytics reuse | `src/lib/intelligence/customer-*`, `src/components/intelligence/customer-control.tsx`, `use-insights-conversation.ts`, `customer-studio.tsx`, `customer-agent.ts` |
| Current visible naming and appearance | `src/components/shell.tsx`, `vault.tsx`, briefings/panels, relevant `src/app/` copy and semantic layout CSS |
| Regressions and contracts | Existing `tests/unit/`, `tests/integration/`, `tests/e2e/`; `README.md`, `docs/STATUS.md`, `docs/CAREOS.md`, `docs/INTELLIGENCE.md`, `docs/API.md`, current design/architecture/product docs |

Keep coordinated ownership of shared host/contracts and agree on an integrated verification window after edits settle.

## 5. Delivery slices and acceptance

### Slice 1 — North ☆, one question-first journey

**Customer outcome:** from any customer page, ask for recent purchases as bullets, open the intended purchase/receipt, ask a product question and return to the library without a forced picker or lost conversation.

Deliver Slice 1 through two owner-reviewable checkpoints. **Implement 1A first and stop.**

#### Checkpoint 1A — interaction foundation (authorized now)

- Rename and outlined-star identity, no assistant attribution; Pal Care stays primary.
- Compact header/overflow, one scrolling conversation and persistent composer.
- Searchable context control, direct selection/removal and dismissible purchase clarification.
- Persistent conversation/drafts across customer navigation, close/reopen and expand/collapse; separate product context and per-answer scope metadata.
- Non-blocking selection/correction; existing dispatched-request identity/recovery/permissions remain unchanged.
- Four optional discovery suggestions; collapse after conversation starts. Unimplemented library shortcuts are clearly identified as upcoming rather than dispatching incorrect single-purchase answers.

**1A acceptance/review:** exit accidental selection without history loss; direct context change/removal; retained draft/timeline across routes/expansion; no automatic prompt on context selection/expansion; no financial authority. Deliver concise summary, desktop/mobile Light/Dark screenshots, functional/regression results and limitations/deviations. Native expanded analytics and global retrieval remain later work. **Do not refresh the working private preview or proceed to 1B before owner review approval.** Owner subsequently approved `/tmp/opencode/palcare-north-1a-verification` for fixture-only isolated builds/tests/screenshots, with no preview changes or public exposure.

**Subsequent exact AI-evaluation approval:** execute and evaluate **exactly 60 genuine model calls** against fictional fixtures through the existing authorized provider. Cover purchase/date/value requests, context changes, follow-ups, formatting, recovery and edge cases; evaluate actual outputs for accuracy/grounding/usability/format/context. Use remaining calls to retest failures and regressions, not stop early when tests pass. Maintain a per-call evidence ledger; deterministic work, mocks and requests that never reached the provider do not count. Keep every failed/unknown provider reservation accounted under the original safeguards. No paid credits, financial operation, private-preview use or 1B implementation. Check actual existing authority before every dispatch; stop/report external denial/exhaustion rather than bypassing it. Record actual usage/cost if available. This test milestone is incomplete until all 60 genuine calls are evaluated; later-feature prompts test honest current limitations, not claim those features implemented.

**Further owner approval after the first 60 completed:** one **additional 100-call** genuine fixture-evaluation batch, for **160 calls total**. The repeated owner message is one authorization, not two additional batches. Keep the original 60-call manifest/results/registry, original shared policy/accounting and all prior failures intact. Use a separately identified capped batch for direct retests, harder provenance/context/formatting/recovery cases and post-correction regressions; no 1B implementation or preview refresh. Actual current remaining allowance/provider status must permit each dispatch. This approval does not reset a session, buy credits, enable paid fallback, authorize financial operations or expand public access.

#### Checkpoint 1B — library intelligence (review approval required)

- Date-filtered purchase retrieval, linked lists and actual bullets.
- Deterministic saved-record queries and provider-free supported questions.
- Per-question library scope without clearing persistent product context.
- Integration with exact-purchase care and source/document isolation.

**Dependencies:** existing A projection and fixed-scope readers; existing conversation/recovery contracts; compatibility of the unified timeline with both customer transports. Close any prerequisite gaps discovered in this path before accepting B/C behavior.

**1B acceptance:** date-filtered bullets are correct from Home and a focused Twin; a global question retains the selected product; exact receipt links never cross purchases; supported saved queries work with model access unavailable and cause zero provider calls. Selection/history/expansion regressions from 1A remain passing.

### Slice 2 — Useful personal analytics in the same workspace

**Customer outcome:** ask for category value, receipt coverage or a chart, inspect the exact matching records, then drill into a purchase and return to the same analysis.

Add deterministic monetary/document queries, category aliases, shared filtered result snapshots and native value/chart presentation. Expand into the existing Insights workspace with the same conversation; retain all three views, custom source widgets, real cross-filtering and validated browser-local layouts.

**Dependencies:** Slice 1 query/timeline contracts; demonstrated A native-widget/data consistency; existing local Studio gate. Keep accessible saved-result summaries usable when native presentation is unavailable.

**Acceptance:** split monetary totals match integer calculations and visible records; receipt queries exclude non-receipt documents; composed date/category/provenance filters agree across all outputs; chart clicks cross-filter native/custom widgets; save/restore/reset preserves exact permitted state. Every assistant-controlled action passes the exact B SDK/data postconditions.

### Slice 3 — Natural follow-ups, explanation and integrated acceptance

**Customer outcome:** move naturally between “only last month,” “make that a list,” “explain this pattern,” and exact-product care, with reliable corrections and recoverable failures.

Complete bounded intent/format follow-ups and grounded interpretation over the shared facts; refine empty/loading/error/availability states and long-answer reading using owner feedback. Verify the full A→B→C journey, then D. Useful real Sol Medium checks may run only under the actually valid existing authority and remaining accounting.

**Dependencies:** proven calculations and result scope; actual model eligibility for live checks; owner visual/task feedback. Unavailable live authority blocks genuine-model acceptance, not provider-free development.

**Acceptance:** the task matrix below passes, semantic/source review is recorded, exact delivered-commit CI passes and owner walkthrough feedback is resolved or explicitly open. Public E readiness remains governed by its separately approved access/licensing/provider/deployment decisions.

### Required task matrix

| Task | Observable pass condition |
| --- | --- |
| Accidentally choose receipt search, then change your mind | Dismiss or type another question; composer stays usable, no mandatory selection/continue/clear. |
| Request purchases in a relative date range from Home and from headphones | Same correct library record set; explicit dates/scope; no accidental single-purchase answer. |
| Request bullet points | Actual linked bullets, requested filters retained, usable copied text; no substitute picker/cards-only answer. |
| Ask total/category purchase value | Exact minor-unit arithmetic, split Sample/Verified Sandbox totals, clear currency/window/unpriced counts; distinct same-model purchases counted correctly. |
| Find purchases with receipts | Only exact attached receipts qualify; each opens the corresponding purchase's document. |
| Aggregate → product care → aggregate | Correct dated Twin/source isolation, same timeline/draft, previous analysis and filters recoverable. |
| Global question with a product selected | Effective answer scope is the library; persistent product context remains selected and available for the next product question. |
| Expand into Insights and return | Conversation, draft, filters, persistent context, question scope, results and navigation context are retained; expansion creates no conversation/model request. |
| Request a native view/chart change | Actual SDK execution/read-back and rendered data agree; failure cannot produce a success message. |
| Change topic during a choice or dispatched request | Choice dismisses immediately; in-flight identity/usage stays accounted; late results cannot change the new topic's scope/view. |
| AI access expires/is denied; storage/network fails; reload after uncertainty | Supported records queries remain useful; no model fallback, auto-replay or quota release; private transcripts remain protected. |
| Keyboard, mobile and long reading | Focus/escape/return work; visible composer at narrow widths and enlarged text; upward reading is respected; Light/Dark/System and reduced motion work. Real-device keyboard/IME review is reported separately. |

## 6. Verification and delivery controls

Add meaningful domain regressions for scope precedence, relative dates, amounts/provenance, exact receipts, duplicate identities, filter consistency and recovery. Extend existing dedicated-PostgreSQL and browser coverage for contract changes. Run lint, format, typecheck, units, build, deterministic/offline evaluations and relevant integration/browser/accessibility/compatibility suites in a coordinated verification window. PostgreSQL suites use an explicit dedicated `TEST_DATABASE_URL`.

Keep fixture/injected checks, actual private-application observations, actual model/SDK results, exact-commit CI and human/real-device feedback separately evidenced. Do not call scripted answers model intelligence. Saved-record tests must positively prove zero model dispatch when access is unavailable. Existing model/source review remains necessary beyond schema validation.

The active preview is running from this primary checkout. A build requires a coordinated bounded stop/build/start, or an explicitly owner-approved isolated verification location; never rebuild its live `.next` underneath it. Owner visual/task approval precedes the coordinated preview refresh. Preserve credentials, expiry, consumed/unknown usage, original payment/evidence records and private HTTPS/OpenCode routing.

## 7. Authorization and review gates

**Owner approved North ☆, these refinements and the three-slice roadmap; begin Checkpoint 1A only.** Stop after its implementation/report for the owner's review. No Checkpoint 1B implementation, working private-preview refresh, paid model usage or financial operation is authorized by this delivery. The plan is approved; acceptance still requires evidence.

Current implementation approval covers 1A customer code, tests and documentation, the explicitly approved isolated verification copy, the original 60-call fixture evaluation and the separately approved additional 100-call batch above. The private preview must stay running and untouched. These batch ceilings operate within actual existing provider authority/accounting, not a reset of the original journal, policy or unknown reservations. Financial operations, application migrations/credential provisioning, license activation and public deployment retain their separate exact owner-approval boundaries.

External constraints remain **November 12, 2026 at 12:00 PM PST** for the conservative submission cutoff and **December 15, 2026** for judge access. The old **`2026-10-29T22:10:58.310Z`** AI window is historical and expired; later standing authority has separate policy/provider/quota checks and browser sessions capped at 30 days with seven-day idle expiry. This planning review did not inspect live allowance or infer permission from old usage snapshots. Public AG Studio coverage/expiry through judging is unestablished; local evaluation does not establish it.

## Planning handoff

- **Implemented:** approved refinements recorded before implementation. 1A implementation/evidence will be reported separately in STATUS.
- **Verified:** primary directory/main/remote and clean starting tree; `pnpm workspace:check`; runtime/installed dependency and source-contract review; repository documentation baseline and all 12 local document links. The initial whitespace check caught a Markdown hard-break trailing space, corrected before final validation. GitHub reports baseline [run 41109042549](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41109042549) **success** for exact `47f62048b8e820d81078c0c575efb0b3f15aa005`; that result verifies neither this new document nor the proposed redesign. No fresh application/provider acceptance is claimed.
- **Incomplete:** implementation, new acceptance evidence and owner design/task review.
- **Blocked:** 1B and subsequent implementation await 1A review approval; real-model and public-readiness gates retain their separate permissions/evidence.
- **Next:** implement 1A → screenshots/tests/limitations → owner review decision → 1B only after approval.
