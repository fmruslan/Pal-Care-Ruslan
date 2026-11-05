# Ten products, ten useful Care examples — approval proposal

**Status: owner approved the design and grouped headphones histories; candidate implementation is under verification, not deployed.** The owner subsequently added distinct fictional amounts for the six new purchases, dated real retail references for all ten products and a separately authorized genuine PayPal Sandbox showcase. [Retail research](evidence/CARE-RETAIL-REFERENCES.md) and [exact new persistence packet](CARE-TEN-PRODUCT-PERSISTENCE-APPROVAL.md) extend this plan; no historical amount is overwritten and a lower reference never establishes eligibility. New database/financial/browser authority remains separately gated. [STATUS](STATUS.md) records actual results; **40f3187** remains the recorded live baseline. The original proposal wording below retains its planning scope.

## 1. Customer outcome and delivery gate

One compact Care collection shows what the customer owns, what is happening and one useful next action. Ten distinct product cards use original SVG illustrations, subtle secondary timelines, accurate filters and the existing integrated North field.

This is one capability **C** vertical slice on the accepted A/B foundation, followed by **D** integrated acceptance and the private-release portion of **E**. It includes data, shared projections, presentation and North together. Public judging readiness, external integrations and financial execution remain separately evidenced.

Reference: the **final two-column, ten-product mockup**, rather than the earlier one-column/sidebar concepts. The carried conversation contains the design brief and attachment references, but no inspectable image pixels in this research pass. The measurements below are proposed implementation targets, not measurements or pixel-level verification of the attached artwork. Inspect the original attachment during implementation if it is available; otherwise request it before matching its finer visual details.

## 2. Findings from the existing application

| Existing contract | Consequence for this update |
| --- | --- |
| `src/components/care/feed.tsx` renders compact horizontal cards in three separate vertical sections. | Keep the useful card anatomy and replace section stacks with one responsive grid, maintaining action-first order. Separate sections can create incomplete rows instead of the desired five-row composition. |
| `src/components/product-art.tsx` already contains four original SVGs with semantic theme colors. | Extend this family with six recognizable illustrations; a drawing, animation or chart dependency is unnecessary. Replace its catch-all speaker rendering with an explicit neutral unknown-art fallback. |
| `src/lib/care/summary.ts` groups by Twin, has four filters and uses actual protection monitoring. | Add product-level presentation grouping, Protected and one shared count/predicate function. Keep every underlying dated Twin independently addressable. |
| `ownership.ts`, `ownership-contracts.ts`, `answer.ts` and `repository.ts` already share facts between Care, details and North. | Extend this path with typed simulated evidence instead of writing product-specific strings in cards or prompts. |
| Shipment/delivery are explicitly not connected; return deadline is unknown; saved warranty dates are reports, not verified coverage. | New scenarios need structured evidence and validation. A generic sample event or document title cannot turn these states into verified outcomes. |
| `care/protection/model.ts` requires verified capture, exact Forma F-01 identity and the original approved binding. | Raspberry Pi and iPhone cannot be added by relaxing this validator or applying a later policy to an old purchase. |
| The Pi's original purchase price is a zero placeholder, with no payment claim. | A Pi price-drop example needs its own explicit hypothetical purchase basis; it cannot use zero as a paid amount or alter the original receipt/history. |
| Database evidence records five Twins; bundled fixtures have four. The headphones have both sample and genuine Sandbox purchases. | Six additive new products yield ten product identities and eleven database Twins, not ten Twins. Fixture mode must never fabricate the eleventh Sandbox Twin. |
| North currently limits answer steps, sources and highlights; highlights identify exact Twin/topic/revision. | Ten-product summaries need explicit completeness/truncation handling; grouping must still expose the exact purchase and evidence requested. |
| Official recall support is one reviewed historical Insignia notice, not a speaker recall feed. | The speaker uses a simulated notice; official evidence review must state its limited scope and never borrow the Insignia match. |

Toolchain checked: Node **22.23.4**, pnpm **10.34.7**. Repository pins Next **16.4.2**, React **19.3.1**, AG Studio **3.0.0**, Drizzle ORM **0.45.4**, existing Radix dialogs, Lucide and Tailwind. Reuse these contracts and pins.

## 3. Recommended resolution: ten products, all purchase histories

**Replace the duplicate headphones tile, not its database identity.**

1. Insert six new fictional product/Twin pairs: refrigerator, leather boots, mattress, hardcover book, iPhone and video game.
2. Display one headphones product card with **“2 dated purchases”** and an accessible purchase selector. Preserve sample Twin `00000000-0000-4000-8000-000000000201`, its original documents and its independent watch. Preserve actual Sandbox Twin `21301174-dcfa-4e19-b5cc-18f21e745700` and its verified payment evidence.
3. Group only by trusted product identity and compatible snapshotted variant, never fuzzy names. The selected dated purchase remains explicit. A matching finding on either purchase remains discoverable; a severe finding cannot disappear behind the representative purchase.
4. In the initial application dataset, **All products (10)** means ten distinct product cards backed by **11 purchase records**. Purchases, search, receipts and Insights continue to expose all eleven records with separate provenance. Fixture mode has ten sample Twins and ten products.
5. A product-level filter counts a group once if any member matches; selecting the result opens the matching dated purchase. Ambiguous North receipt requests still ask which purchase. No “first ten” truncation: future genuine records must remain visible and counts must grow honestly.

This recommendation needs owner confirmation because it interprets “replace one sample headphones purchase” as a presentation change while honoring the explicit preservation requirement. Exactly ten stored purchase records would conflict with preserving all five originals and adding six new ones.

## 4. Visual specification

### Composition

- Keep **Care / Purchases / Insights**, the existing heading and one Search / Ask North field.
- Place five wrapping filter pills beneath the field: **All products / Needs attention / Watching / Protected / Completed**, all with derived counts.
- Add one quiet text summary, not KPI tiles: **10 products · N active verified windows · M need attention**. Explain simulated-window counts separately in a compact disclosure; zero verified windows is an acceptable honest value.
- One two-column CSS grid when the available content width supports approximately 440px per card; use `minmax(0, 1fr)` tracks. At tablet/narrow widths, collapse to one column. Cap desktop at two columns even on a wide display.
- Normal desktop target: roughly **160–190px** per card, **12–16px** gaps, **16px** corners/padding. These are targets to check, not fixed heights: enlarged text and disclosures must grow naturally.
- Each card: **64–80px product illustration → name/date/provenance → one prominent pill → one short explanation → thin timeline and one primary action**. Evidence stays in the existing disclosure/dialog.
- Mobile: roughly **52–64px** art, stacked text where necessary, a single column, **44px** primary/control targets, wrapped filter labels and no clipped names, dates or provenance. Avoid whole-card links containing nested interactive controls.
- Preserve action-first ordering in DOM and visual order. Five rows are the initial unfiltered ten-product state, not a forced row count when filtering or expanding evidence.

### Original SVG art direction

Use a cohesive softly dimensional illustration family: confident silhouettes, restrained material highlights, consistent stroke weight, one grounding shadow and a muted product-specific wash. Bronze anchors the product interface, violet denotes North, and slate supports dark mode. Simulated coverage uses neutral/bronze/violet treatment rather than an unqualified verified-green check.

| Product | Illustration treatment |
| --- | --- |
| Raspberry Pi | Green board, identifiable ports and chip geometry, readable at thumbnail size |
| Refrigerator | Brushed-metal double-door silhouette, subtle handles and side plane |
| Headphones | Existing over-ear silhouette, refined cushions and highlights |
| Kettle | Existing gooseneck shape with warm enamel/metal treatment |
| Speaker | Existing rounded grille and handle, no alarming red decorative glow |
| Boots | Warm leather pair, stitched panels and grounded soles |
| Mattress | Layered rounded slab, restrained quilt lines and piping |
| Hardcover book | Cloth cover, visible spine/pages and original geometric cover art |
| iPhone | Recognizable phone/camera silhouette and original abstract screen, without copied marketing artwork |
| Video game | Original game case/controller composition; no third-party cover art |

Use responsive `viewBox` sizing and CSS color tokens. Prefer simple geometry and gradients over expensive blur/filter stacks. If gradient/clip IDs are needed, scope them per rendered instance, including when a product appears in both Care and North. Use a synchronous component's `useId`, or an explicit stable surface/instance prefix; database IDs remain React list keys. Decorative art is hidden from assistive technology because the product identity is real HTML text. No image downloads, canvas runtime or external artwork service is needed.

### Compact SVG timelines

- Approximately **24–32px visual strip**, with **44px HTML interaction area**; thin 2px lines and small markers. Visual thinness does not require tiny hit targets.
- Show three to five relevant milestones, such as purchase → shipment → delivery, or purchase → current window → expiry. Keep the complete evidence/history accessible in the existing panel.
- HTML buttons and labels carry meaning, keyboard focus and date descriptions; SVG is decoration. Unknowns use text and hollow/dashed marks, not a fabricated completed segment.
- Describe it as a **compressed milestone sequence**, not a proportional time axis. A three-year warranty and a two-day return deadline should not imply equal elapsed time.
- North can reveal a requested milestone omitted from the compact strip, then read back its exact evidence. Reduced motion removes transition effects; hover changes border/shadow rather than card position.

## 5. Ten working, evidence-backed scenarios

“Working” here means persisted source records drive deterministic state, timeline, filters, evidence navigation and North. Controlled examples remain simulated; they do not become live carrier activity, manufacturer coverage or payment eligibility.

| Product | Card pill / useful action | Persisted evidence and truthful behavior |
| --- | --- | --- |
| Raspberry Pi 5 | **Price drop · simulated** / Review example | Two ordered, exact-variant simulated catalog observations plus a separately labeled hypothetical purchase amount and price policy. Calculate an illustrative potential adjustment in integer USD units. Original zero-placeholder ownership and real Pi guidance remain distinct; no actual eligibility or savings claim. |
| Refrigerator | **Extended warranty · simulated** / View terms | Fictional plan document, exact Twin/model, base and extended coverage intervals, issuer, exclusions and expiry. Extended coverage requires its own terms; it is not inferred by adding years to purchase date. |
| Everyday headphones | **Protected · simulated** / View protection | A fictional protection example bound to the sample headphones Twin. The grouped card clearly identifies that sample purchase; its other dated purchase retains genuine Sandbox payment evidence, without inheriting the sample's coverage. |
| Pour-over kettle | **In transit · simulated** / Track delivery | Ordered fictional shipment updates, demonstration carrier label and an explicitly estimated arrival. No real carrier logo/tracking URL or invented delivery confirmation. |
| Everywhere speaker | **Simulated notice** / Review notice | A fictional investigation record, with `officialMatch = false` and identity gaps. Separate saved official evidence explains checking source, brand/model and batch/serial restrictions. No confirmed recall, safety all-clear or fabricated remedy. |
| Leather boots | **Warranty active · simulated** / View warranty | Fictional purchase-linked warranty document, dates and exclusions, evaluated at the disclosed scenario date. |
| Mattress | **Return ending · simulated** / Review return | Structured fictional policy with exact cutoff, timezone, condition/restocking exclusions and purchase binding. Show the remaining demo interval; prepare an editable unsent enquiry. |
| Hardcover book | **Protection not verified** / Review documents | A sample receipt and explicit missing policy evidence. Do not create a pretend policy to fill the empty state. |
| iPhone | **Monitoring · simulated** / View checks | Exact fictional ownership variant, fictional merchant price terms and dated simulated check history. Label this a saved monitoring example, not a running external price tracker or Apple policy. |
| Video game | **Return ending · simulated** / Review return | Fictional return terms with sealed/opened restrictions and exact cutoff. Unknown condition stays unknown; nearing a date is not proof of eligibility. |

All six new Twins use existing **`origin = sample`**, with null PayPal/capture/verification fields. Customer-facing wording is **“Fictional demo purchase”**, not “Verified Sandbox.” Only genuine retrieved PayPal evidence earns the latter distinction. New sample receipts and policy documents are clearly marked, independently addressable and searchable.

### Scenario time and monitoring

Recommend a **versioned, fixed scenario snapshot** with a visible **“Simulated examples as of [date]”** label. Store scenario effective dates separately from actual insertion/read timestamps. This keeps “return ending” examples reproducible without secretly moving deadlines every morning or expiring the demonstration before review.

Only simulated calculations use this disclosed scenario date. Real purchases, existing workers, authorization, provider usage, current observations and actual deadlines always use real time. North repeats the scenario date when explaining relative deadlines. Saved check history says when the simulated example was checked; it never claims “checked just now.”

This recommendation uses **no new timer or worker authority**. Existing authorized workers continue independently. A genuinely advancing simulated catalog worker would be a different scope with exact inputs, cadence, credentials and expiry; it is unnecessary for the proposed persisted examples.

## 6. Shared data design and scoped migration proposal

### Small additive model

Reuse `products`, `purchase_twins` and `documents` for six new sample purchases and their supporting documents. Avoid widening existing event kinds merely to fit shipping or safety into free text.

Proposed two new append-only tables, with final definitions reviewed during implementation:

1. **`care_demo_packs`**: stable pack ID/version, manifest hash, disclosed scenario `asOf`, actual creation timestamp and fixed fictional customer/merchant scope.
2. **`care_demo_evidence`**: stable evidence ID, pack ID, exact Twin ID, typed kind, source document ID, bounded versioned payload, content hash, simulated effective/observed times and actual recorded timestamp. Typed kinds cover policy, price observation, shipment update, safety investigation and evidence gap. Unique pack/evidence keys prevent duplicates; relational constraints bind Twin/document/merchant scope. A simulated flag is constrained true.

Zod discriminated schemas validate each payload; SQL enforces identity, provenance, shape/size basics and append-only behavior. The manifest declares every new product/Twin/document/evidence identity and expected content hash. Price observations reference their predecessor and policy; warranty intervals and return cutoffs are structured inputs, not parsed from prose by a model.

Load this through the existing `getCareFeed` path as a separately typed simulation source. Extend ownership contracts with explicit provenance/scenario metadata and a separate simulated-facts collection, preserving actual facts. One server projection supplies card, filter, timeline, details and North. Reuse safe pure date/hash/arithmetic helpers where applicable; add typed simulation rules for the newly supported scenarios. Do not pass fake captured-payment inputs into the existing Forma/Guardian validator or add a bypass flag to its trusted path.

The price example's hypothetical purchase amount never enters `purchasePriceMinor`, receipt totals, verified adjustments or native spending aggregates. Documents linked to old purchases explain that they were added as demonstration evidence and are not original purchase terms. Actual and simulated sources remain visibly separated inside evidence panels.

### Migration and permission scope for later exact approval

- One selected, versioned **`drizzle/demo-care`** migration lane with its own standard Drizzle journal, following the protection lane's precedent. Root **0016**, existing Care/protection SQL and their journals remain untouched.
- Insert six product/Twin pairs and a manifest-bounded set of new sample documents/scenario facts. Final row counts, IDs, SQL SHA-256 and grant definitions will be included in the approval packet before application execution.
- One new independent **read-only scenario credential**, limited to fixed-scope new-lane reads, with explicit expiry and readiness checks. No new standing writer or worker credential. Migration authority remains private and absent from web files/environment; original credentials/grants are preserved.
- Transactional application with lock and pre/postcondition checks. On rerun, matching rows are a no-op; a reused ID with different content **aborts**. `ON CONFLICT DO NOTHING` alone is insufficient because it can conceal conflicting seed content. No update-to-fit or blanket seed reset.
- Explicit dedicated test database proves repeatability, rollback on partial failure, conflicting-ID rejection, required read grants and denied writes/DDL/financial access.
- Existing original-row hashes must match after activation. Legitimate background job/AI accounting advances are tracked separately rather than requiring mutable runtime tables to stay frozen. The existing protection sweep may discover the added sample Twins under its current bound and record unavailable-policy states; it must not reinterpret simulated facts as approved policies or create adjustment notifications from them.
- Database mode fails visibly if the enabled scenario source is missing/broken. Bundled fixture mode uses the same versioned sample manifest for parity, not a fallback for application DB errors.

**Approval of this design does not apply SQL.** The exact migration/credential packet is the only anticipated new application permission decision. No financial permission is required by the proposed slice.

## 7. Filter and summary semantics

Compute one shared set of predicates from the validated product groups and evidence; use it for counts, card membership and North's attention results. Count products once per filter; explain that filters can overlap rather than implying their counts sum to ten.

- **All products:** all valid loaded product groups, retaining every dated purchase.
- **Needs attention:** a supported actionable finding, a closing simulated return window, simulated price opportunity or explicitly simulated investigation. Missing book protection alone is informational, not an urgent alert.
- **Watching:** actual monitoring only when existing source/schedule/freshness rules pass; also include the explicitly labeled saved monitoring scenario. Separate actual and simulated counts in its accessible explanation. A lone old watch record does not establish active monitoring.
- **Protected:** evidence establishes an open applicable window, or the card explicitly demonstrates one under simulated terms. Payment verification alone does not qualify. Label any simulated membership in both card and filter explanation.
- **Completed:** an explicitly resolved Care action, never simply paid/purchased/expired/quiet. **Zero is correct for the proposed initial ten scenarios**; do not invent a refund or resolved investigation to populate this filter.
- **Active verified windows:** distinct currently applicable purchase-bound window records that satisfy the actual evidence rules, deduplicated by Twin/type/policy/window. Simulated windows, manually reported dates and payment-only proof are excluded. The initial value can remain zero.
- If reads are incomplete, label counts as loaded/partial and disclose unavailable evidence; missing evidence is not a zero-risk finding.

## 8. North integration and exact selection

Preserve the genuine model-first task planner, current provider accounting, one-field Search/Ask behavior, server-owned follow-up history, drafts and existing native Insights execution. Extend the typed aftercare inputs and instructions to understand simulated facts and product grouping. No keyword chatbot or second conversation store.

Required journeys:

| Question | Expected behavior |
| --- | --- |
| “What needs my attention?” | Same product membership/count as Care's attention filter; simulated reasons and dates stated. If the answer/highlight cap is reached, state how many more and link to the full filtered collection. |
| “Which purchases have a return window closing?” | Mattress/game only when their source-backed scenario predicates match; exact dated Twin, cutoff and scenario-time label. |
| “Is my refrigerator still under warranty?” | Explain simulated base/extended terms and expiry, distinguish them from real coverage, open the exact warranty evidence when asked. |
| “Did any product drop in price?” | Pi's two simulated observations and hypothetical amount explained; no zero-placeholder arithmetic or recovered-money claim. Preserve separate original headphones watch evidence. |
| “What's happening with my kettle delivery?” | Read the persisted simulated shipment sequence/ETA, with no invented carrier lookup. |
| “Are any of my products affected by a recall?” | Explain the speaker notice is simulated and no official match is established. Demonstrate source/identifier checks using the existing reviewed official evidence, state its historical/limited scope, and offer the official CPSC lookup link. Never say a comprehensive fresh search ran. |

Fresh “open/show” actions must select the right product group **and dated Twin**, reveal the intended milestone, and read back visible Twin/topic/revision plus the new scenario/evidence identity. If a current filter hides it, expose the scoped selection visibly or open its exact Twin; never claim success against a hidden card. Ambiguous headphones questions keep the existing dated-purchase chooser.

Add scenario identity metadata compatibly to new results. Old stored answers retain original immutable content, fingerprints and semantics; History is read-only and never replays presentation/model work. A scenario revision change invalidates a stale highlight rather than silently showing newer facts as the old answer.

For official safety evidence, reuse the saved reviewed source and deterministic matcher. Linking the CPSC lookup or reading its website during engineering research is not application-side broad recall integration. Expanding the connector is a separate task.

## 9. Implementation order and acceptance evidence

After plan approval, continue through these engineering gates without routine reapproval:

1. **Data-to-card-to-North first:** define the versioned manifest, provenance and product-group contracts; implement representative Pi/refrigerator evidence end to end, then all ten scenarios in the same path. Prepare the exact SQL/credential packet while continuing unaffected UI/test work.
2. **Complete compact presentation:** original ten SVGs, two-column grid, five filters, restrained summary, thin accessible timeline and exact grouped-purchase selection. Reuse dialogs and native Insights.
3. **Focused integrated verification:** domain rules and regressions; dedicated PostgreSQL seeded twice; DB → actual Next UI → North injected execution → exact evidence/read-back. Verify every scenario, not just ten rendered boxes.
4. **Release gates:** lint, format, typecheck, unit tests, build and relevant integration/accessibility/browser/failure/compatibility checks; commit/push the integrated code and require all three mandatory exact-commit CI jobs with existing coverage. Avoid duplicating complete sequential local campaigns when CI already owns that full coverage. No measured speedup promise.
5. **Approved activation/private release:** after exact database approval and green CI, apply selected migration, verify original release against additive schema, deploy the exact CI-green application SHA to existing private **8444 → 3002**, and run actual HTTPS smoke. Preserve a startup-tested rollback; restore application assets/configuration automatically on a critical regression, never old data/credentials/accounting.

Detailed acceptance:

- Ten product cards / eleven original-plus-new DB purchase identities; ten sample fixtures; both headphones receipts/histories/watch accessible, with no cross-Twin policy borrowing. New purchase data is searchable and appears with honest sample totals in native Insights.
- Typed provenance on every scenario, valid source associations, immutable hashes, conflicting policy/identity rejection, return/warranty boundary tests, unknown opened-game condition, ordered shipping events and price observations. Simulated records cannot enter real coverage/refund/recall confirmation paths.
- Date behavior before/at/after each boundary, timezone handling, fixed scenario clock isolation from real clock, stale reads, missing DB source, partial collection and honest filter/summary counts.
- All six requested North questions, exact open actions, multiple-headphones disambiguation, old History restoration, cancellation/unknown recovery, and receipt → totals → Audio → actual native chart → exact product → source-backed care → previous result.
- One lightweight **desktop/mobile × Light/Dark** visual smoke batch, with owner handling subjective polish review. Functional checks separately cover 320px reflow, 200% text, keyboard/focus restoration, reduced motion, target spacing, contrast and Axe. Update only deliberately affected visual references; mandatory CI remains comparison-only.
- Actual HTTPS smoke checks persistence across reload, ten-card grid, both headphone identities, source dialogs, filters, Purchases/documents/Insights and no automatic model/financial dispatch on page load or appearance changes. Browser emulation is not real-device acceptance.

**Genuine North check:** the previously approved disposable browser was consumed/revoked. Propose one new disposable browser, **at most eight questions / sixteen counted attempts**, within the actually valid existing policy/provider permission and remaining allowance, then revoke it. No allowance or expiry reset. Six requested questions plus two targeted continuity/open follow-ups fit this ceiling; injected tests cover the broader matrix. This browser scope needs explicit approval if fresh agent-run inference is desired; otherwise genuine acceptance stays visibly incomplete. Historical **271/300** usage is not a current grant check.

The recorded worker/credential stop boundary remains **2026-12-04T20:18:12.252Z**. The submission cutoff remains **November 12, 2026, 12:00 PM PST** and judge access requirement **December 15, 2026**; the scenario snapshot does not renew permissions or establish public/license readiness.

## 10. Research sources and applied decisions

- [MDN: SVG viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox): scalable coordinate systems for sharp, lightweight art across card sizes.
- [React: useId](https://react.dev/reference/react/useId): unique repeated-instance IDs and SSR constraints; use database identities, not generated IDs, as list keys.
- [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): WCAG AA's 24px minimum/spacing rules; this design aims for 44px primary touch targets while keeping timeline strokes thin.
- [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): preserve information/function at 320 CSS pixels with responsive stacking, not forced-height clipping.
- [PostgreSQL 17: INSERT](https://www.postgresql.org/docs/17/sql-insert.html): conflict handling avoids duplicate inserts but does not itself validate pre-existing content; add manifest equality checks.
- [CPSC: official recalls and warnings](https://www.cpsc.gov/Recalls) and [existing Recall Guardian contract](RECALL-GUARDIAN.md): official lookup and saved scoped evidence remain distinct from a simulated speaker notice. Researching the directory is not a product recall assessment.

## 11. Approval requested and handoff

**Approve the plan:** compact ten-product design; grouped headphones histories; six additive sample purchases; clearly separated simulated evidence and fixed disclosed scenario date; continuous implementation/test/CI/private deployment after gates.

**Separate exact activation decision:** review the forthcoming SQL hash, row manifest, new restricted reader and expiry before any application migration or credential provisioning. Existing exact Care/protection approvals do not cover this new lane.

**Optional explicit live-check decision:** approve the single bounded genuine-North browser described above. This adds no allowance, provider, financial or renewal authority.

- **Implemented:** this research/approval document only; no ten-product application behavior is shipped.
- **Verified:** primary workspace/main/remote and clean starting tree; `pnpm workspace:check`; runtime versions; source-contract inspection and the official references above. Documentation checks `node scripts/verify-repository.mjs` and `git diff --check` pass. No new application tests, actual-application observations or exact-commit CI result are claimed.
- **Incomplete:** implementation, final SQL/row manifest, integrated acceptance, new genuine North evidence and release.
- **Blocked:** application activation awaits exact new database approval; a new agent acceptance browser requires the explicit bounded decision. Fine visual matching requires access to original mockup pixels.
- **Next:** owner approves or adjusts the proposed history/count and simulation-time decisions; proceed through C/D and private-release gates with the current working preview available.
