# Unified ownership timeline, smart status pill and North ☆

**Status: core scope A and bounded genuine-North check B approved by the owner; implementation in progress.**

The owner's explicit **“Approve A and B”** authorizes the core implementation and gated private release, plus one new disposable browser for at most eight questions / 16 counted attempts within existing actually valid authority/allowance, revoked afterward. It does not approve the separately gated extensions, new allowance, financial operations or database/credential changes described below. The original proposal follows as the scope/acceptance contract, not a delivery claim.

Research date: **2026-11-04**. Includes the owner's SVG/micro-interaction addition and streamlined visual-review direction. No implementation, application/database/provider operation, new browser, commit/push or deployment is authorized by this document itself. [STATUS](STATUS.md) remains implementation truth.

## 1. Recommendation and approval requested

Build **one evidence-backed ownership view per dated Purchase Twin**, shared by its top-right status pill, interactive timeline, Care cards and North. Deliver the useful existing-record experience first, through one integrated release. Continue the separately scoped connector work when its exact permissions and sources are available.

**Customer outcome:** understand what happened, what is known or missing, and the next supported action without navigating four different interpretations of a purchase. Preserve **Care / Purchases / Insights**, the one Search/Ask North field, documents, native Insights and original histories.

This advances **capability C**, reusing A/B, followed by D functional acceptance and E private release readiness. Final visual/UX acceptance belongs to the owner **after** deployment; unusable controls, incorrect facts and failed mandatory checks still block deployment. Full external monitoring and a new real Sandbox financial demonstration remain explicitly incomplete until their separate gates pass.

### Decisions

1. **Approve the core implementation/release below (recommended):** shared facts, smart pill, unified SVG timeline, North read/presentation integration, Care attention links, existing catalog-watch visibility, editable unsent requests, required verification and rollback-protected automatic private **8444 → 3002** deployment. No routine engineering approval stops after this approval.
2. **Separately approve one bounded genuine-North acceptance browser:** one new disposable browser, **up to eight questions / 16 counted provider attempts**, solely within the existing actually valid policy, provider permission and remaining shared allowance; revoke afterward. No allowance increase, policy/session renewal, reset, paid fallback or replacement browser on failure. The previous one-browser approval was consumed/revoked. This is a request, not current permission.
3. **Reserve exact activation decisions:** new financial operations, tracking POST/PATCH or carrier access, expanded CPSC ingestion, customer-facing writes, new credentials/grants/migrations, license activation and public access require their own exact scope. Approving item 1 does not approve these. Engineering may prepare a specific proposal while unaffected core work continues.

Approve item 1 and explicitly accept/decline item 2 independently. Declining item 2 leaves genuine new-North acceptance unresolved; injected tests will not be called genuine acceptance or silently substituted for the requested release gate.

## 2. Research findings that change the implementation

Official documentation was reviewed, with the installed SDK and application contracts inspected independently. Public documentation research is not a live Sandbox integration test.

| Finding | Consequence for Pal Care |
| --- | --- |
| PayPal recommends Orders v2 package tracking for Orders v2 integrations; legacy `/v1/shipping/trackers-batch` is deprecated. [S1–S3] | Use existing SDK Orders v2 methods if a separately authorized tracking integration is added. Do not start a legacy tracking stack. |
| Orders v2 tracker states are `SHIPPED` and `CANCELLED`. PayPal documents `SHIPPED` as merchant-assigned tracking, **not the carrier's actual shipment state**. Legacy v1's richer enumeration is a different contract. [S2–S4] | Display **Tracking added · merchant supplied** for that evidence alone. Never map it automatically to In delivery or Delivered. A canceled tracker does not mean the purchase/payment was canceled. |
| Tracking creation associates an order, capture and tracking number. `notify_payer=false` does not necessarily suppress PayPal-app notifications. [S3] | Tracking writes are external side effects, not read-only UI work. Approval must identify the exact order/capture, payload and notification implications. |
| Payments v2 exposes refund `PENDING`, `COMPLETED`, `FAILED`, `CANCELLED`, and refund retrieval by ID. [S5] | Reuse existing Guardian/refund reconciliation. Approved, submitted, unknown and provider-completed remain distinct. A partial refund is **Partially refunded**, not a full purchase refund. Do not fabricate a pending interval if Sandbox completes immediately. |
| Transaction Search is account-scoped; third-party use requires PayPal partner access and transactions can take up to three hours to appear. [S6] | No universal consumer PayPal-history promise or Transaction Search dependency for the timeline. Read the already verified saved capture/receipt. |
| CPSC offers machine-readable JSON/XML recall notices. [S7] Existing project evidence covers **one reviewed historical notice**, and its structured model field was empty. | Reuse saved exact-source assessments. A name match or successful API response alone cannot establish applicability. Full model/variant/batch/date restrictions matter; no-match within limited coverage is not an all-clear. |
| Official rules require PayPal's free Sandbox plus an AI tool, with PayPal central; a working runnable repository can satisfy demo access without public hosting. [S8] | The existing verified payment → Twin is a strong starting point. A new refund is optional for the core release, separately approved if desired for the demonstration. Private Tailscale access alone does not establish judge access. |

**Hackathon constraints verified:** submission cutoff **November 12, 2026, 12:00 PM PST**; judging ends **December 15, 2026**. Public open-source repository with license, complete functional setup/access and public YouTube video **under three minutes** are required. The five equally weighted criteria are implementation, design, impact, innovation and presentation. Keep owner secrets out of the public repository; any needed judge-access arrangements are a separate controlled delivery task. License and authorization expiries do not extend because judging continues. [S8]

## 3. What already exists — reuse instead of rebuilding

| Foundation inspected | Reuse / gap |
| --- | --- |
| `src/app/vault/[id]/page.tsx` | Exact dated purchase, provenance, receipt, source/history and Guardian/safety sections. Add the shared pill/timeline here; retain Overview / Documents / Care & History anchors. |
| `src/lib/care/{model,repository,answer}.ts` | Care and North already share some deterministic aftercare facts. Extend this seam into the common ownership projection rather than adding four state engines. |
| `src/lib/care/{contracts,store,persistence-runtime}.ts` | Durable manual return events, warranty dates and catalog watches already exist. Keep their actual source labels; a manually reported merchant acceptance is not externally verified. |
| `src/lib/careos/activity.ts`, Guardian/refund and safety services | Existing source-linked history, independently verified-refund rules, original policy bindings and conservative recall matching. Preserve their domain authorities. |
| `src/lib/careos/records/{conversation-service,semantic-runtime,followup}.ts` | Genuine Sol/medium selects bounded tasks; server resolves products/facts. Extend `aftercare` for ownership topics and validated milestone presentation. Preserve server-owned history anchors. |
| `src/app/care/[id]/page.tsx`, `src/components/care/return-draft.tsx` | Existing exact-product details and editable unsent return enquiry. Use the common facts here too, removing contradictory unconditional gap text when supported records exist. |
| `scripts/care-worker-container.ts`, existing Care timer | Network-disabled fictional Forma catalog checks, once/day per watch, hourly sweep, max 50/run and 30-day expiry. Read its evidence; do not add PayPal/carrier/CPSC networking to this worker. |
| Installed `@paypal/paypal-server-sdk` **2.5.0** | Contains `createOrderTracking` and `updateOrderTracking`; tracker enum is `SHIPPED`/`CANCELLED`. No upgrade is needed merely to investigate tracking. Existing adapter does not thereby become an activated shipping integration. |
| Existing React, Radix dialog, Lucide and inline product SVGs | Build small original SVG timeline components using existing controls/tokens. No animation library, chart replacement or new UI framework. |

Workspace research confirmed `main`, remote `fmruslan/Pal-Care-Ruslan`, clean HEAD **ea1b8db**, Node **22.23.4**, pnpm **10.34.7** and serving-build provenance **b28e666**. The last recorded release passed all three CI jobs; genuine North acceptance was partial. Historical **263/300 reserved / 37 remaining / one unknown** is not a current permission check.

**Important data limit:** original `demo-v1` terms say fictional goods do not ship and provide no real warranty or automated price adjustment. The later **14 × 24-hour** `demo-price-v2` promise is future-only and not retroactively applicable. A polished timeline must show **Not applicable under these demo terms**, **Unknown**, or **Not connected**, as appropriate—not invent 30-day returns or one-year coverage. Zero manually recorded cases at the release checkpoint is not permission to manufacture milestones.

## 4. One source of truth

### Architecture

```text
Existing purchase / policy / Guardian / Care / safety records
                      ↓ scoped read adapters
              ownershipView(exactTwin, asOf)
      ┌───────────────┼───────────────┬────────────────┐
  Status pill      Timeline       Care cards       North facts
      └───────────────┴───────────────┴────────────────┘
                   Same IDs, sources and rules
```

Proposed files: `src/lib/care/ownership.ts` for pure domain projection and a scoped server loader alongside `repository.ts`. This is a **read model over existing authoritative ledgers**, not a new master-status table or duplicated financial ledger. Care's summaries must derive from these facts, not the reverse: a warranty outside an attention window still belongs on its product timeline.

Each projected fact carries:

- Stable exact Twin, domain, fact/event and source/revision identity.
- State, source label and evidence link; purchase provenance and event verification are separate fields. A Sandbox payment cannot make an unrelated manual delivery event verified.
- Occurrence/effective date, observation/recording time, date precision and timezone/basis where known; never use retrieval time as the event time.
- Relevant amount/currency or policy version/deadline basis, calculated server-side.
- Per-source availability, completeness and freshness; last successful check and last failed attempt are distinct where stored.
- Validated supported actions and stable milestone targets, generated by the application.

Use separate payment, fulfillment, return, refund, price-window, warranty and safety states. Handle duplicates, conflicting evidence and stale/out-of-order updates per domain. Do not pick the newest text across all domains as truth or fill skipped steps. Preserve original source records and append-only correction history.

**Consistency:** derive each response with a single `asOf` clock and evidence-revision key. Server-render the initial facts; request-scoped caching avoids repeated loads. Re-read saved facts on navigation, explicit refresh and bounded visible-page refresh where needed; no external/model work on those reads. Update all visible consumers from the returned projection together. Older North answers remain immutable **as-of** history and are labeled when older than current facts; they are not rewritten to pretend they were always current. A fresh question/refresh reads current records.

Exact-Twin detail must remain available beyond the bounded library window. Use the existing by-ID fixed-customer scope and add a scoped Care read if necessary; never interpret a truncated library result as missing ownership. Optional-source failures preserve readable purchase evidence while explicitly marking affected facts unavailable.

### Status pill rules

- Place one compact pill top-right of the product identity area; keep the Sample / Verified Sandbox provenance visible independently.
- Priority: **confirmed applicable safety alert → consequential conflict/failure needing review → pending refund / active return → relevant deadline attention → latest supported lifecycle outcome → purchase/recorded ownership**. Use deterministic stable tie-breaking, never model confidence. All independent states remain in the disclosure.
- A possible recall is **Needs verification**, amber; red **Recall alert** requires official notice plus all applicable identity checks. Current sample matching does not establish physical identity or automatically qualify for red.
- **Purchased · Sample**, **Purchased · Verified Sandbox**, **Tracking added · Merchant supplied**, **Return requested · Reported by you**, **Refund pending · Sandbox**, and **Partially refunded · Verified Sandbox** make provenance inspectable without implying unsupported authority.
- Unknown/unavailable facts never downgrade established payment evidence or become success. No return/warranty source is different from a confirmed exclusion in the applicable terms.
- Click/keyboard activation opens one accessible detail panel: independent states, full available history, sources, freshness and one primary next action. Escape/close restores focus. Bounded histories say when incomplete.

### Timeline rules

- One ownership timeline directly beneath product information. Cover purchase, shipment, delivery, price-adjustment window, return window and warranty; add actual returns/refunds/safety events when recorded.
- **Dated items sort by their actual dates.** The illustrative Purchase → Shipment → Delivery → windows sequence is not a forced chronology: a price window might expire before delivery.
- Label **Compressed timeline · spacing is not elapsed time**. Unknown/not-applicable milestones stay on the same component with undated/open markers, never arbitrary x-axis dates. Expanding reveals precise dates and evidence as an accessible list, without requiring a new calendar library.
- Distinguish recorded/completed, current, upcoming, expired, unknown, unavailable and not applicable with text plus icon/shape. A date passing expires a window; it does not complete a delivery, return or refund.
- Deadlines require applicable snapshotted terms and a known triggering date. Delivery-based policies remain unknown without delivery evidence. Existing 14 × 24-hour rules retain exact timestamp/exclusive-boundary semantics; do not replace them with calendar-day arithmetic. Date-only warranties retain the current documented UTC-date convention without inventing an hour. Conflicting terms or unknown precision explain the limit instead of offering a false countdown.
- Each milestone opens its own evidence/action in the shared panel. Use stable allowlisted deep links such as `/vault/{id}?milestone=return-window`; validate against that Twin's projection. Preserve old `/care/{id}#returns` and other direct links.
- Mobile uses the same single timeline with readable compact markers, controlled horizontal browsing where needed and an expandable chronological list. Keyboard focus reveals the selected milestone; page/body must not overflow. No hover-only content, clipped labels or miniature text to squeeze six dates onto a phone.

## 5. SVG graphics and micro-interactions

Use the owner's supplied mockup direction and Bronze/Violet/Slate design system. This planning pass specifies behavior and composition, not pixel-level acceptance of the attachments.

- Custom responsive SVG rail, rounded milestone markers and short verified-segment emphasis form the signature ownership timeline. Use HTML buttons and an ordered text list for interaction/semantics; SVG is the visual layer, not an inaccessible drawing that contains all controls.
- Reuse a small icon vocabulary across pill, timeline, Care cards and return detail. Retain recognizable existing Lucide shapes where suitable; original vector accents for North's violet star and minimal empty states.
- Bronze/neutral = normal progress; green = explicitly verified successful event; violet = North/presentation; amber = review; red = confirmed safety/serious error. Text remains authoritative and contrast follows existing tokens.
- Proposed transitions: approximately **120–180ms**, opacity/border/short connector emphasis. Animate only an evidenced segment; no continuous marching line, artificial completion percentage, countdown animation or celebration suggesting money arrived. A missed intermediate return step remains visibly missing.
- North activity reflects an actual in-flight request. No decorative “checking” animation when a connector is absent, paused or expired. Reduced motion removes nonessential animation and smooth scrolling; facts and controls remain identical. [S9]
- Inline trusted assets only; no fetched SVG, injected markup, embedded scripts/foreign objects, remote font or heavy animation dependency. Decorative SVGs are hidden from assistive technology; meaningful information has a visible accessible label. Use unique IDs if an asset needs masks/gradients.
- Keep 44px control targets, visible focus, scalable text, Light/Dark/System contrast and touch alternatives. Add small SVG touches only where they clarify the ownership task; this is not a whole-site illustration redesign.

## 6. North and Care as one experience

Extend North's current model-selected `aftercare` task with payment/delivery/return/deadline/warranty/price/refund/safety topics. Preserve natural language, original message, exact dated-product disambiguation and broad-library queries that ignore stale product pins. Do not replace the model planner with a keyword router.

| Question | Required behavior |
| --- | --- |
| Where is my order? / Has it arrived? | Read exact fulfillment evidence; distinguish tracking assigned, merchant report and carrier event. For existing fictional goods explain that nothing ships. Open the matching milestone/evidence. |
| Can I still return this? | Show applicable policy, known basis/deadline and relevant conditions; otherwise explain the missing evidence. Offer an editable **unsent enquiry**, not a claim of eligibility or submitted return. |
| How much warranty time remains? | Use the same exact date/basis as the timeline, with manual/sample qualifiers. No inferred standard duration. |
| Did the price drop? | Compare exact product/variant/currency and comparable amounts; distinguish current catalog reading from a timestamped watch observation. State difference, not guaranteed savings. |
| Is this recalled? | Retrieve saved official-source assessment and identity/coverage limitations. Do not imply a fresh comprehensive CPSC search. |
| What should I do next? | Rank the same supported actions as Care. Prepare return/refund/warranty/price enquiries when useful, without sending or authorizing them. |

AI interprets the question and selects useful evidence/explanation; deterministic code owns statuses, numbers, dates, links and permission. Ground any generated explanatory wording in those facts/sources. Routine load, status calculation, milestone clicks and watch comparisons use **zero inference**. Stay within the existing bounded call path rather than adding a second always-on agent or interpretation call to every poll.

North may propose a typed **open/highlight milestone** presentation intent. Server resolves exact Twin/milestone; client validates route and current navigation generation. For an explicit “show/open” request, execute it and read back the actual route, visible expanded milestone and corresponding evidence identity before claiming success. Ordinary answers offer the action without unexpectedly navigating. History replay does not auto-run actions, create a case, resubmit a turn or spend inference. Preserve drafts, original results, request UUIDs, GET-only unknown recovery and context through Care → Twin → receipt → Insights → History.

Care surfaces only actionable supported findings: approaching known return/warranty dates, potential price opportunity, relevant safety assessment, pending/unresolved refund. Use the same projection and source labels. One compact product/status/source/action card, deduplicated by underlying fact; clicking lands on the exact milestone. Missing feeds are not a reassuring “all cared for.” Read-time reminders do not imply push/email notifications or a newly scheduled external checker.

## 7. Updates, tracking controls and separately gated extensions

### Core release: existing-authority path

Read saved payment/refund/Care/safety facts and the existing checked catalog watch. Existing authorized writers/checker persist supported changes; the common projection reflects them on refresh. Display actual last successful check, next due, pause/error/expiry and source scope. Keep host-private reporting/opt-in/pause commands and the existing limits intact. No new application migration or credential is planned for this path.

The existing watch schema has **saved / active / paused / error / expired**, not terminal cancellation or an append-only history of every price observation. Do not claim either already exists. Private pause/disable stops checking without erasing history; it is not relabeled as terminal cancellation. Customer-facing opt-in/pause/cancel controls are a genuine additional write capability and are not implemented as pretend buttons or by reusing a North cookie.

### Follow-through for the complete monitoring goal

| Extension | Exact next scope/evidence before activation |
| --- | --- |
| Customer-facing tracking opt-in / pause / cancellation | Separate owner-only write capability, exact Twin/watch/action binding, CSRF/Origin/rate/idempotency controls, no public visitor write authority. Define terminal cancellation/resume rules, append-only control audit and permitted credential placement. Present reviewed SQL hash and role changes if needed; old Care SQL approval does not cover extensions. |
| Durable shipment events and source-backed return-policy dates | Versioned additive evidence schema only where existing contracts cannot represent them. Specify event/source IDs, exact order/capture/item relationship, occurred/observed times, correction/deduplication and provenance; new private ingestion role cannot rewrite commerce or manual reports into external verification. No fabricated backfill. |
| PayPal tracking demo / real carrier events | Exact Sandbox tracking write approval plus notification effects; carrier selection, credentials/free-use terms, allowed hosts, signed events or bounded retrieval and real acceptance. A future isolated network-enabled connector is separate from the intentionally network-disabled catalog worker. |
| Fresh PayPal refund/payment monitoring | Reuse separately scoped reconciliation and persistent attempts/keys. Specify exact existing operation/capture and read limits; never poll financially from every page load or move PayPal credentials into the Care worker. No new refund POST without separate exact financial approval. |
| Broader CPSC refresh/matching | Reviewed official endpoint/query scope, bounded response/time/cadence, source revision/hash and all applicability constraints; explicit ingestion/schedule permissions. Retain prior valid evidence on outage, mark stale/changed-source review. Do not infer comprehensive coverage from the one-notice adapter. |
| Complete price-observation history | If requested beyond last successful observation, propose additive append-only observations and least-privilege worker insert permissions; preserve current due/expiry limits. Do not synthesize past observations from current catalog values. |

These are named capability gaps, not hidden work in the initial delivery estimate. Implementation continues through the core while exact extension proposals are prepared; external activation waits for its own decision.

## 8. Delivery sequence and acceptance

These are capability gates within one scoped project, not calendar promises or routine reapproval checkpoints.

| Gate | Deliverable | Acceptance evidence |
| --- | --- | --- |
| C1: one-facts vertical slice | Exact existing Twin → ownership projection → pill + clickable timeline → North explanation → Care deep link. All surfaces consume identical domain facts. | Unit parity and scope tests; one connected injected journey; persisted source labels and original financial evidence preserved. This is the first integrated slice, not four separate feature builds. |
| C2: all supported states and finish | Deadline/conflict/unknown/error/loading states, unsent enquiries, SVG/reduced motion, mobile panel, history and existing-watch freshness. | Boundary/state and meaningful dedicated-DB regressions; keyboard/axe; same fact IDs/amounts/dates across all surfaces; original direct URLs and native Insights preserved. |
| D: focused genuine acceptance | New ownership questions plus existing receipt/totals/Audio/native-chart/product-care/History continuity. | Authorized disposable browser only; inspect actual evidence and executed UI state, not a success string. Preflight automation against injected responses before spending calls; explicitly open History rather than blindly toggling it. Review actual meanings; retain failures/unknowns. |
| E: private release | Exact committed build, all mandatory CI, verified rollback, private deployment and HTTPS smoke. | Commit/source/build receipts, three green job URLs/results, actual saved-record/runtime/secret boundaries, desktop/mobile Light/Dark smoke and owner handoff. |

### Functional/regression matrix

- Exact ownership and provenance: Sample vs Sandbox; same model on different purchase dates; wrong Twin/capture/refund; truncated library; source outage vs empty result.
- Independent states: delivered + return, refund + safety warning, tracker cancellation vs payment, manual report vs external proof, pending/failed/unknown/partial/full refund. No intermediate-state filling.
- Dates: before/on/after boundary, zero days, exclusive exact-time rules, leap day/month/year boundary, timezone/date-only precision, delivery-triggered unknowns, conflicting terms, no retroactive policy application.
- Evidence: duplicate/conflicting IDs, revised source, late arrival, preserved immutable history, bounded completeness and stale last-check handling. No broad recall all-clear.
- UI/actions: all milestone clicks, source links, deep-link reload/back, real panel state/focus, keyboard/enlarged text/mobile touch, reduced motion, unsent drafts and failure recovery. Harmless presentation issues no payment/provider POST.
- North: seven requested question intents, synonyms/follow-ups, ambiguous dated purchases, explicit context switch, shared-fact parity, actual milestone execution/read-back, immutable History and unknown-call recovery. Broad adversarial/edge coverage is injected/offline; real calls are reserved for useful semantic acceptance.
- Persistence: use explicit dedicated `TEST_DATABASE_URL` only; existing restricted readers/writers/worker remain appropriately denied. Original purchase/payment/policy/document/accounting integrity tests stay mandatory.

### Bounded genuine-North acceptance proposal

Use at most eight questions within 16 counted attempts; some turns can require more than one accounted call. Suggested connected sequence: receipt → all purchases/totals → Audio/native chart → exact dated product delivery → return/deadline → warranty → price → safety/next action. Product-care and prior-result navigation are also checked without unnecessary extra turns; offline coverage verifies remaining combinations. Modify the exact wording to exercise follow-ups, not to fit a rigid parser.

Before each dispatch, verify actual browser/policy/provider expiry, quotas, remaining worst-case call headroom and unchanged accounting. Stop on expiry, exhaustion, denial or unknown outcome. Revoke the single browser on success or failure and verify denial. No second browser to rescue a script bug. If permission cannot be established, report the genuine acceptance gate blocked rather than spending or treating a historical quota as authority.

## 9. How this gets built faster

**Eliminate redundant work while keeping release-critical coverage.** The previous release's recorded CI jobs took **20m26s, 20m59s and 15m41s**, running together. That is a measured baseline, not a promise of a 21-minute implementation or a newly demonstrated speedup.

1. **Lock the core fact contract early.** One projection and evidence panel eliminate duplicated date/status/AI logic. Reuse storage, SDK, assistant, theme and controls. No framework upgrade, new event platform or provider onboarding on the core path.
2. **Use a change-to-test map.** Run lint/format/types/units and relevant focused database/browser/accessibility regressions locally once for the integrated source. Full fixture/database/native/protocol coverage remains in the existing **three parallel mandatory CI jobs**. Do not run a second full sequential local campaign while identical CI is running.
3. **Freeze application edits before integrated verification.** One coordinated build/test window, no shared-build/database races. Prepare docs and acceptance scripts during development; don't debug selectors during expensive genuine inference. Independent research/read-only work can overlap; do not multiply agents or mutable test environments without explicit authorization.
4. **One lightweight visual smoke batch:** desktop Light, desktop Dark, mobile Light, mobile Dark; inspect the representative Twin, expanded evidence, Care deep link and North state. Catch clipping, overlaps, contrast/focus and broken controls. Owner handles premium-design polish on the live site. No repeated subjective pixel-perfect cycle.
5. **Keep existing screenshot CI checks.** Refresh only intentionally affected baselines once after functional stabilization and inspect their diffs; preserve existing thresholds, assertions, retries and timeouts. This baseline maintenance is distinct from the single manual smoke pass. Repeat only for a diagnosed failure or a later relevant change, not because a screenshot “could look nicer.”
6. **One release candidate at a time.** Push once focused gates pass; let all three CI jobs run concurrently. Failure means a named diagnosis, targeted repair/regression and a new exact-SHA CI result, not rerunning unchanged suites hoping for green.
7. **Prepare rollback while CI runs without touching serving assets.** Preserve/source-hash/startup-test the current approved release using the existing private mechanism. Build the clean exact candidate only in a coordinated bounded stop/build/start or an explicitly approved isolated verification location. Never overwrite the active server's `.next`; no new worktree by default.
8. **Promote once, smoke once, finish.** After mandatory CI and genuine acceptance gates, automatically deploy to private 8444, verify actual HTTPS route/build/facts/controls and roll back application assets/configuration on a critical regression. Preserve records, credentials, attempts and accounting. New connector paths, if separately enabled, must be disable-able on rollback.
9. **No documentation-induced redeployment loop.** Include planned scope/API/status wording before the release commit; retain post-release exact-SHA/CI/runtime receipts in release artifacts and the handoff. Add actual results to STATUS afterward as documentation, without pretending that docs-only SHA is the running application. Under current workflow docs pushes still run CI, but that alone does not require another application build/cutover or an idle local finalizer. Never claim an unreceived docs CI result.
10. **Clear progress and explicit closure.** Updates identify the completed gate, actual failing check or next running job with its link. At handoff report the deployed SHA, HTTPS result, remaining limitations and owner review link. End task-specific servers/watchers/finalizers; leave only the website and deliberately approved catalog timer running. No surprise follow-up deployment after closeout.

No fixed engineering dates or guaranteed percentage speedup are proposed. Measure local verification elapsed time, longest CI job and deployment downtime separately for this delivery. Time is saved primarily by avoiding duplicated complete suites, repeated screenshot refinement, release-evidence rebuild loops and unnecessary new integrations.

## 10. Demonstration and definition of done

**Core live story:** open the existing genuinely verified Sandbox purchase → inspect payment evidence in the pill/timeline → view honest delivery/policy gaps and the actual catalog-check evidence → prepare an unsent enquiry → ask North to explain the next supported action → return to the same milestone/history.

That is a working ownership experience, **not a new live checkout/refund demonstration**. Fixture/dedicated-test scenarios can demonstrate return/refund/shipment transitions with clear simulation labels; they must never be injected into application financial records or presented as provider verification.

**Optional separately approved financial story:** exact allowed Sandbox checkout/capture → matching Twin → approved tracking entry if useful → authorized return/adjustment workflow → bounded refund → independently retrieved outcome → same timeline/North facts. The historical completed $129 experiment is not reusable permission; old `demo-v1` purchases cannot acquire the later price promise. Specify exact capture/case, amount, policy, request keys, cap, expiry, reconciliation and stop conditions before any new operation. A new purchase or refund is not required merely to test the timeline.

Core is complete only when all four surfaces share validated facts, all supported controls/loading/error states work, required functional/CI/genuine checks are evidenced, rollback and actual private HTTPS pass, and remaining connector/demo limitations are disclosed. **Owner visual review remains pending until the owner reviews it**, but subjective polish does not hold deployment. The complete monitoring/financial extension is not called shipped from a green core UI.

## Sources

- **S1 — PayPal, integration selection:** https://developer.paypal.com/track-orders
- **S2 — PayPal, deprecated legacy tracking batch:** https://developer.paypal.com/api/tracking/v1/trackers-batch-post
- **S3 — PayPal, Orders v2 tracking creation/notifications:** https://developer.paypal.com/api/orders/v2/orders-track-create and https://developer.paypal.com/api/orders-v2/track-orders/use
- **S4 — PayPal, Orders v2 tracker meaning and official machine-readable enum:** https://developer.paypal.com/api/orders/v2/definitions/tracker_status and https://github.com/paypal/paypal-rest-api-specifications/blob/main/openapi/checkout_orders_v2.json
- **S5 — PayPal, refund states/retrieval:** https://developer.paypal.com/api/payments/v2/definitions/refund_status and https://developer.paypal.com/api/payments/v2/refunds-get
- **S6 — PayPal, Transaction Search access/latency:** https://developer.paypal.com/docs/transaction-search/
- **S7 — CPSC, official API information:** https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information ; project-specific actual evidence: [Recall Guardian](RECALL-GUARDIAN.md).
- **S8 — Official PayPal AI Hackathon rules, sections 1, 4 and 6:** https://paypalaihackathon.devpost.com/rules
- **S9 — W3C, animation from interactions:** https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html (SC 2.3.3 is AAA; reduced motion is also an explicit product requirement, not a claim of full WCAG certification).

Research limitation: several PayPal pages returned only their client-rendered shell to direct text fetch; the official search-indexed documentation was checked against the fetched PayPal OpenAPI and installed SDK for tracking. No authenticated PayPal/CPSC application call, carrier experiment or coverage certification occurred.

## Planning handoff

- **Implemented:** this proposed plan only, including SVG design, shared-fact contracts, scope/authority decisions and streamlined release workflow.
- **Verified:** static repository/SDK review, workspace check and public official-source research. No new application/test/CI/provider acceptance claim.
- **Incomplete:** all new timeline/pill/North presentation implementation and its acceptance; separately gated tracking/connector/financial extensions.
- **Blocked:** implementation awaits the requested plan approval; a new genuine test browser needs the separate bounded decision above. Exact external/database/write decisions are required only for the extensions that cross them.
- **Next:** owner approves core scope and independently decides the bounded North browser. Then implement the C1 connected slice and continue through C2/D/E without routine design-approval pauses.
