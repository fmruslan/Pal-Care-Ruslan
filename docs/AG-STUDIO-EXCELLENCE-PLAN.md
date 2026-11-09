# AG Studio Excellence Pass — approval proposal

**Status: approved with adjustments, November 9, 2026; implementation/acceptance tracked in [STATUS](STATUS.md).** The owner approved the four product improvements and PR/private release, made 3.1 optional, and subsequently requested focused existing tests and the established rollback/deployment process rather than a new verification project. **Delivery retains 3.0.0** and its lifecycle patch; no package upgrade is a prerequisite. The sponsor's [official judging-key arrangement](AG-STUDIO-JUDGING-LICENSE.md) supersedes the trial proposal below. No key is issued/configured and no separate trial is activated. Original proposal details below retain their research context, not new acceptance claims.

## Outcome and delivery gate

Make the existing Care calendar a memorable, useful example of a custom Studio widget, and make Insights feel like one polished personal-purchase workspace. Demonstrate native charts/grid/KPIs, source-backed custom widgets, layout tools and North's actual verified Studio execution in one connected journey.

This is one bounded capability **C refinement → D acceptance**, reusing accepted A/B foundations. Capability E still requires independent judge hosting, authorized public North and legitimate licensing. Submission cutoff: **November 12, 2026, noon PST**. Judge access and relevant entitlements must cover **December 15, 2026**. Advance on evidence, not invented intermediate dates.

### Research baseline

- Authoritative checkout: `/home/bigrus/projects/palcare`, remote `fmruslan/Pal-Care-Ruslan`; planning began from clean `main` at `11cd030a400e22bebc10fb0849f65703a5b4bf56`. Workspace check passed with the installed pnpm on PATH; Node build provenance is `v22.23.4`.
- Previous release evidence: [PR #16 delivery comment](https://github.com/fmruslan/Pal-Care-Ruslan/pull/16#issuecomment-6752981683), exact-main full [42703111203, attempt 2](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/42703111203), and `/tmp/opencode/customer-ux-refinement/deployment.json`. These establish the previous private delivery, not acceptance of this proposal. STATUS deliberately retains its pre-release checkpoint.
- Installed `ag-studio` / `ag-studio-react`: **3.0.0**, with a pinned lifecycle patch for grid destruction and WebKit KPI ResizeObserver handling.
- Native recorded-value chart and separate Sample/Sandbox KPIs already exist. The recorded-value chart is an allowlisted optional widget.
- Source-record and loaded-window disclosures already default collapsed. The larger duplication is inside the Documents & Care custom widget, which renders full purchase cards.
- Data checkpoint: **11 dated purchases / ten products; ten Sample + one Verified Sandbox; Sample $2,942.94; Sandbox $129.00**. Pi has no recorded price. These are acceptance reference values, never UI constants or authority for new transactions.

## 1. Care: the first showcase

Keep the current **Ask North → Your next 30 days → product cards** hierarchy. Refine the existing `care-timeline` widget, registered inside real AG Studio and populated through `widgetApi.getData`.

- Give the calendar a coherent, quiet surface: compact heading, legible date range, balanced event cards, aligned product artwork/connectors, consistent borders and deliberate spacing.
- Improve Today, previous/next navigation, selected/focused event treatment, and narrow-screen horizontal navigation. Keep 44px interactive targets, keyboard access, text resizing and reduced-motion support.
- Stabilize the initial calendar height and measured content so loading/resizing does not visibly push the product cards around. Keep content reachable at 200% text and on small screens.
- Keep the rolling 30-day UTC projection, exact dated-product/source links, compressed-day disclosure, visible truncation count and complete event view. Missing dates remain unknown; historical dates never move to make the calendar look busy.
- Add a small, accessible **“Interactive calendar · AG Studio”** attribution near the existing all-events link. A compact expandable explanation can identify the custom widget/data query for judges without dominating the customer view.
- Polish the existing all-events Insights presentation and its native event grid consistently. Move its duplicated full textual event list into a clear disclosure while retaining every source link and the unavailable/partial states.

**Acceptance:** calendar event IDs equal the validated Studio query; each visible event opens its original dated product/evidence; all-events grid/filter IDs agree with the source projection; empty, incomplete, midnight-rollover and narrow-screen states remain honest. The Care calendar is described as a **custom Studio widget**, not a vendor-provided native chart.

## 2. Insights: one designed native workspace

### Recommended fresh/reset layout

```text
My Purchases | Documents & Care | Price Adjustments
Compact filters + visible active selection + layout controls

Purchases in view | Sample recorded value | Verified Sandbox value
Unknown-price exclusion, when relevant

Recorded value by category       | Purchases by category
Sample / Verified Sandbox       | Native whole-purchase counts

Saved purchases — native sortable/selectable grid
Evidence & Care — compact custom widget
Source records / verification details — expandable
```

On mobile, stack the same real widgets with usable heights and readable labels. Confine necessary grid/calendar horizontal scrolling to their own regions. Keep the chart and selected scope prominent before long evidence details.

### Presentation changes

- Extend the existing semantic Bronze/Violet/Slate theme through supported Studio parameters: widget spacing/borders/title typography, grid row/header treatment, KPI scale, chart palette, axes and tooltips. Use restrained slate for Sample values and a distinct verified-evidence color for Sandbox, always with explicit legend/text labels.
- Promote `extra-recorded-value-chart` into **fresh/reset My Purchases layouts**. Reuse its current native grouped bars and separate `sampleUsd` / `sandboxUsd` mappings. Preserve the native category-count chart and all three views.
- Keep three useful native KPIs: purchase count, Sample recorded value and Verified Sandbox value. Describe these as recorded values, not verified real-world spending. Show the excluded unknown-price count alongside them when relevant.
- Format money consistently as USD with two decimal places, right-aligned where supported. Format dates clearly and consistently in UTC without changing underlying saved identities, chronological sorting or date-filter semantics.
- Modestly increase native grid row spacing; use clear column titles, sensible widths/wrapping and concise provenance text. If a badge renderer helps, use the supported field cell-renderer hook and retain the text, keyboard behavior, sorting and selection.
- Make active origin/category/cross-filter scope and its clear action unmistakable. Selections must work through the native chart and Studio state, not a decorative overlay.
- Keep loaded-window scope, provenance and unavailable-data disclosures close to the workspace. Consolidate repeated suggestions and keep complete accessible records readily expandable.

### Supported APIs and the count-axis limitation

The installed 3.0.0 public types support `studioTheme.withParams`, `studioWidget*`/`studioValueWidgetFontSize`, grid row-height and header formatting, chart palette/axis/title/label styling, field `formatOptions.format`, `blankValue`, `createValueFormatter`, and grid `createCellRenderer`. Use the matching version's public API and verify the rendered result.

**Whole-number tick spacing is a conditional target.** Inspected 3.0.0 and published 3.1.0 Studio chart types expose tick appearance but not numeric tick intervals or an arbitrary chart-options callback; `AgChartWidgetOptions` exposes locale. Do not copy standalone AG Charts configuration into Studio or round fractional ticks into duplicate/misleading integers. Verify integer field formatting and native data labels in the actual SDK; use an additional tick control only if officially supported for that version. If unresolved, retain truthful axes, explicit integer data labels/tooltips and document the vendor limitation. The upgrade is not claimed to fix this.

## 3. One stronger custom evidence visual

Improve the existing **Documents & Care** widget into **Evidence & Care**, preserving its registered type/identity and data-engine query.

- Use one original, small SVG evidence map with labeled groups for **saved purchases, saved documents and available care references**. It describes linked evidence, not a completion/protection score or another timeline.
- Derive every displayed count/link from validated selected purchase IDs and trusted joined records. Count distinct source IDs when claiming a document/source count; shared care references and purchase counts have different denominators. Preserve Sample/Sandbox distinctions.
- Show a compact useful summary and a bounded preview of exact dated-purchase links, with “View all selected records” expanding the complete evidence path. Unknown/unavailable sources stay explicitly distinct from zero.
- Keep the SVG non-interactive when ordinary HTML links/buttons provide the interaction. Supply equivalent text, visible focus and labels; decorative paths are hidden from assistive technology. Color alone never conveys evidence status.
- Refine **Attention** into concise recorded facts with exact product/source links. Missing documents do not manufacture urgency or a safety all-clear.
- Refine **Price Adjustments** into a clear verified amount, evidence state and expandable cases. Keep proposed, simulated, pending, unavailable and independently verified outcomes distinct. No invented savings or refund success.

**Acceptance:** filtering/cross-filtering changes the custom widget's selected IDs and source counts with the native workspace; stale/duplicate/foreign query IDs cannot yield a successful verification; unavailable evidence is never rendered as zero or complete protection.

## 4. Make North's real actions visible

After successful existing Agent Framework execution, show one concise confirmation tied to that request and observed native state:

> Showing Audio · 3 purchases · Sample $218.00 · Verified Sandbox $129.00.

The example must be computed from the actual selected records. A chart/layout action should name the verified change, such as **“Recorded-value chart displayed”** or **“Saved layout restored”**, with the scope where useful.

- Gate the confirmation on actual page, filters/cross-filters, widget identity/type/mapping, selection/layout, readiness and displayed records/values. Preserve existing SDK/data read-back and rejection semantics.
- Keep technical tools, state/read-back evidence and provenance behind an accessible disclosure. A short supported selection/focus highlight can help customers locate the changed widget without persistent motion or focus theft.
- Invalid, cancelled, stale, unavailable or partially applied actions receive an honest status, never the success confirmation. Following manual edits must not leave an old success message looking like the current scope.
- Preserve immutable results, owned snapshot restoration, History's read-only behavior, drafts and unknown-request recovery. Earlier-view restoration requires an available verified snapshot and fresh matching read-back.
- Describe the architecture accurately: official Studio harness/tool context, built-in inspection tools and the bounded `personal_purchase_view` executor. This is not unrestricted delegation to every vendor agent.

## 5. Targeted dependency upgrade

**Recommended candidate: exact-pin `ag-studio` and `ag-studio-react` together to 3.1.0**, subject to the compatibility checkpoint below. The owner has approved useful package changes.

Official migration documentation dates 3.1.0 to November 4. Published npm metadata confirms both packages, React 19 peer compatibility, and vendor dependencies in the **AG Grid 36.3 / AG Charts 14.3** lines. Its supported `responsiveLayoutBreakpoints` / `singleColumnLayout` APIs offer a concrete mobile benefit. This is metadata/documentation evidence, not a successful Pal Care installation or build.

### Upgrade acceptance checkpoint, before broad visual edits

1. Review the published change set and exact dependency resolution; pin the two direct Studio packages and retain a reproducible frozen lockfile. Keep dependency changes limited to Studio and required vendor alignment.
2. Audit the existing 3.0.0 lifecycle patch against 3.1.0. Prove equivalent grid destruction/aborted-query and WebKit KPI-resize behavior. Do not silently drop the protections or mechanically apply stale bundle offsets. If still necessary, retain only the narrowly reviewed equivalent patch with its regression evidence.
3. Verify imports/registration, license and AI module configuration, native widget data/mappings, Agent Framework tools, state/fingerprint contracts and saved-layout restoration.
4. Prove compact/wide saved layouts and earlier native snapshots remain valid. 3.1 responsive layouts are **view-mode-only** and retain desktop widget heights; they do not automatically replace the existing compact editing/persistence model. Use the new API only where authored layout, displayed geometry and SDK postconditions remain coherent.
5. If compatibility needs a broader rewrite or creates unresolved regressions, deliver the polish on pinned 3.0.0 and report the deferred upgrade. Preserve saved layouts; do not erase storage to make an upgrade pass.

Existing React, SVG, Lucide and Studio APIs are sufficient for this design. Any additional package must have a concrete accepted benefit, compatible license and bounded dependency footprint; package permission does not authorize a paid service or license activation.

### Saved-layout behavior

Valid existing compact/wide layouts restore their original widget identities and positions. The new default chart is offered through the existing add-widget control and fresh/reset layouts; it is not inserted over the user's saved design. Saved JSON continues to contain validated geometry, not executable capabilities or arbitrary mappings. Reset remains an explicit user action. An incompatible historical snapshot is reported unavailable, not recreated and called restored.

## 6. Licensing: resolve the watermark legitimately

Treat this as an early, separate readiness decision. The [official trial page](https://www.ag-grid.com/studio/react/enterprise-licence/) offers **45 days**, production evaluation, all Studio features and watermark removal. Actual issued terms and dates govern.

**Owner decision requested separately:** authorize obtaining/configuring the no-cost sponsor trial, or supply an existing suitable key and terms. Before activation, establish coverage for the actual private preview, intended judge-hosted deployment, demo video, chosen Studio version, built-in widgets, custom widgets and Agent Framework/AI modules through **December 15, 2026**. Confirm the exact expiry/time zone and any limits with the vendor when the issued terms are unclear.

Configure the key using the chosen version's official installation path and existing application gates. Keep keys out of Git, screenshots, logs and evidence documents; record non-secret entitlement/expiry evidence. Verify actual supported runtime validation and watermark disappearance on both Care and Insights. An application flag or package upgrade is not licensing proof. Preserve vendor notices until legitimate configuration removes them.

Studio licensing covers built-in grid/chart widgets. Standalone Enterprise Grid/Charts, including instances embedded inside custom widgets, require their own licenses. This proposal uses native built-ins and an original SVG custom visual.

## 7. Acceptance and release

### Connected demonstration

1. **Care:** inspect the polished calendar, open an exact dated event and follow its source; use the existing all-events link to inspect the custom timeline plus native grid.
2. **Category view:** show My Purchases with all 11 reference purchases, separate recorded values and the Pi exclusion.
3. **Verified Sandbox:** narrow through the real control/allowed tool; one original $129.00 purchase and its receipt remain, with no inherited Sample care claims.
4. **Recorded-value chart:** display the actual native two-series chart; select Audio and verify the exact same three IDs and separated values in the grid/KPIs/custom evidence widget. Test clear-selection and an empty result too.
5. **Layout:** actually drag/resize a widget, save, reload, restore and reset; compare read-back geometry and records. Cover independent compact/wide storage, legacy layouts and active-filter preservation/rejection.
6. **North:** run existing safe injected inputs through the actual SDK/tools for category, filter, chart and available-snapshot restoration. Compare before/after state and displayed values. Exercise missing snapshot, wrong mapping, late/cancelled action and no-success paths. Keep manual History inspection separate from explicit restoration.

### Evidence levels

- **Isolated:** relevant domain/formatting/layout/read-back regression tests; actual Studio browser integration with injected provider inputs; PostgreSQL only through an explicit dedicated `TEST_DATABASE_URL` when required by the lane. Preserve uncaught-error assertions and meaningful native/data checks.
- **Actual application:** desktop/mobile × Light/Dark private HTTPS, native chart selection, layout operations, exact source links, source/provenance values, keyboard, 200% text and Axe. Capture comparable before/after Care and Insights screenshots plus a short native-action sequence. Browser emulation is not real-device acceptance.
- **Genuine inference:** use only any actually unexpired existing authorization and remaining allowance, checked immediately before dispatch. The exhausted **263/263 campaign is closed**. If no valid authority remains, report live North acceptance blocked and retain injected SDK evidence as such. No new campaign, allowance or identity rotation is part of this pass.
- **Exact-commit CI:** publish PR/main SHA, selected lane/reasons, run URLs/results, build ID, release receipt and rollback/HTTPS evidence. Preserve previous failures and historical timestamps.

### Delivery workflow

Use one `palcare/<topic>` branch in the authoritative folder and a PR under [CI-POLICY](CI-POLICY.md). **Expect full CI:** package/lockfile/patch changes are full-risk; the shared `studio-theme.ts` is also outside the current feature allowlist. The trusted classifier decides the entire final range; no policy edit or manual downgrade is part of this pass.

Perform one coordinated local verification window and the required PR/exact-main sequence. Preserve a startup-verified immutable rollback before touching active build assets; coordinate bounded stop/build/start or serve the established immutable release. Deploy only exact clean main after its gate and receipt. Promote application assets/configuration to existing private **8444 → 127.0.0.1:3002**, verify actual HTTPS and preservation fingerprints, and automatically roll back application assets on a critical regression. Records, credentials and accounting are never rolled back.

Update STATUS/INTELLIGENCE/README with actual implementation and evidence distinctions as appropriate; update API documentation only if a public contract changes. Record final operational results without a redundant documentation-only full build/CI cycle. Final submission still requires its separate dispatched full run on the final main SHA.

### Likely implementation areas

- `src/components/care/calendar.tsx`, `calendar-studio.tsx`, `calendar-rail.tsx`; relevant owned styles and event-grid formatting.
- `src/components/intelligence/studio-theme.ts`, `customer-studio.tsx`, `customer-workspace.tsx`, `customer-records.tsx`.
- `src/lib/intelligence/customer-state.ts`, presentation/observation helpers and the existing records-chart contract where required for verified feedback.
- Existing customer Insights, Care/calendar, native tool, layout and cross-engine tests; `package.json`, `pnpm-lock.yaml` and the vendor patch only for the accepted upgrade.

## Approval and handoff

**Approval requested:** the bounded implementation above, relevant tests/fixes, PR commit/push, exact-main CI and rollback-protected automatic private release. Useful package changes are already authorized; actual license activation and independent public deployment remain separate decisions. Preserve private North authority, financial safeguards, PayPal/PostgreSQL records and Tailscale configuration.

Final implementation handoff will include:

1. Completed Care/Insights visual improvements.
2. Exact distinction between native Studio, custom widgets and agent-executed operations.
3. Before/after desktop and mobile screenshots.
4. Cross-filter, layout and SDK/data read-back evidence, separated from genuine inference.
5. Exact commit, selected CI lane/run and private deployment/rollback evidence.
6. Remaining sponsor weaknesses: any count-axis limit, unresolved licensing, unavailable live-provider proof, limited seeded dataset, and real-device/owner review.

Planning handoff: **Implemented:** this proposal only. **Verified:** static code/public API/dependency research and workspace provenance. **Incomplete:** upgrade and visual/action acceptance. **Blocked:** pass implementation pending plan approval; licensing/public judge readiness unresolved. **Next:** approve this bounded pass and decide the separate no-cost license request/configuration scope.

## Official references checked

- [Sponsor criteria and trial offer](https://paypalaihackathon.devpost.com/details/aggrid): custom widgets, theming, layout tools and Studio Agent Framework. Direct page returned 403; indexed sponsor text was available through search.
- [3.0.0 theming](https://www.ag-grid.com/studio/archive/3.0.0/react/theming/), [formatting](https://www.ag-grid.com/studio/archive/3.0.0/react/formatting/), [widget configuration](https://www.ag-grid.com/studio/archive/3.0.0/react/widget-configuration/) and [custom widgets](https://www.ag-grid.com/studio/archive/3.0.0/react/custom-widgets/), checked against installed public types.
- [Migration/version dates](https://www.ag-grid.com/studio/react/migration/) and [3.1 responsive layouts](https://www.ag-grid.com/studio/react/responsive-layout/). The changelog page did not expose individual entries in fetched text; detailed upgrade audit remains an implementation gate.
- [Published Studio 3.1.0 metadata](https://registry.npmjs.org/ag-studio/3.1.0), [React package metadata](https://registry.npmjs.org/ag-studio-react/3.1.0), and [3.1 chart public types](https://unpkg.com/ag-studio@3.1.0/dist/types/api/widgets/shared/agChartShared.d.ts).
- [Enterprise/trial terms overview](https://www.ag-grid.com/studio/react/enterprise-licence/) and [license installation](https://www.ag-grid.com/studio/react/licence-install/). Current pages describe 3.1; use version-matched configuration.
