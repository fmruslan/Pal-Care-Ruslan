# Product-first Home and two-destination navigation

**Status: owner-approved complete implementation and private deployment, November 3, 2026.** The owner approved all four decisions below, full relevant verification, commit/push, exact-commit CI, preserved rollback and automatic deployment to existing private 8444 after safety checks, without another routine approval. The separate 200-case campaign is not a release prerequisite for this slice; focused North checks are required. [STATUS](STATUS.md) remains implementation/deployment truth. The research and proposal below retain their planning context; approval is not verification.

## Recommendation and approval requested

Make **Home the saved-purchase library**, with **Home / Insights** as the two primary links in a horizontal customer header. Open each individual purchase into its existing Purchase Twin, with its documents, care and history together. Keep North ☆ available throughout the journey.

Approve these linked decisions as one customer-experience slice:

1. Replace the customer sidebar and four-link mobile bar with two visible header destinations.
2. Combine Home, purchase browsing and document discovery into one Home experience, including combined search and an explicit **All documents** view.
3. Refine the existing product-detail and document-reader hierarchy, including compact mobile layouts and direct receipt access.
4. Preserve North's conversation continuity and verify its geometry and purchase context through the new navigation.

The owner explicitly supersedes the **four-destination navigation requirement** in [AGENTS](../AGENTS.md), [CUSTOMER-FIRST-PLAN](CUSTOMER-FIRST-PLAN.md), [PRODUCT](PRODUCT.md), [DESIGN](DESIGN.md) and [ADR 0011](adr/0011-bronze-violet-identity.md). [ADR 0012](adr/0012-home-library-navigation.md) records the accepted replacement. Historical four-link screenshots/evidence retain their original scope.

**Customer outcome:** open Pal Care, recognize the right dated purchase, find its receipt or care information, and return to the same collection without losing your place or North conversation.

**Selected capability:** C — unified customer experience, reusing the existing A/B Insights and North foundations. D supplies integrated acceptance. Existing A/B and full-North acceptance gaps remain independently recorded; this slice cannot close them through visual polish.

## 1. What the current product actually does

### Inspection basis

- Authoritative checkout: `/home/bigrus/projects/palcare`, `main`, `fmruslan/Pal-Care-Ruslan`; initially clean at `e2292c9a95e0d1c98187ac3d9ca5fded6dd0f32e`.
- `pnpm workspace:check` passed. Active build `AxRIdYrvgEuD-ZA9m8Fgw`, executable-source hash `ece34c096186fd5f349bbed8bdabf054990801385f034f900c28b6e19486f8e6`, Node `v22.23.4`.
- Reviewed the owner's screenshots, current source/contracts, design decisions, STATUS and previously recorded Light/Dark North screenshots.
- Fresh read-only observation of **8444 HTTPS**, completed `2026-11-03T21:41:05.823Z`: Home, Purchases, kettle Twin, Documents and kettle receipt at **1440×1000** and **390×844**. All ten page loads returned HTTP 200. North remained closed in these fresh browsers; non-GET/external requests were blocked by the observation harness, with **zero such attempts observed**.
- Local observation packet: `/tmp/opencode/palcare-ux-research-20261103/observations.json` and ten screenshots alongside it. These are research artifacts outside Git, not a redesign acceptance suite or real-device study.

| Finding | Evidence | Design implication |
| --- | --- | --- |
| Home and Purchases already show the same five loaded purchase records | `src/app/dashboard/page.tsx`, `src/components/vault.tsx`, fresh DOM inspection | Consolidate the two destinations. `compact` changes artwork size; Home does **not** currently hide purchases behind “View all.” |
| Home has no search; Purchases searches only a contiguous product-name/brand/model string | `src/app/vault/page.tsx` | Combined product/document search is actual new behavior, not just moving a search box. |
| Desktop navigation takes 224 CSS pixels; an open North panel reserves a further reading lane on wide screens | `src/components/shell.tsx`, `src/app/globals.css`, supplied screenshot | Reclaim the navigation column and size content around the assistant's available space. |
| Mobile puts the first Home card at y≈665; its details link begins at y≈939 | Fresh 390×844 observation | The first screen shows only part of the illustration. Reduce the heading/summary stack and use compact mobile purchase cards. |
| The mobile Purchases grid begins at y≈861 | Fresh 390×844 observation | Moving the existing Purchases layout unchanged into Home would retain the same hierarchy problem. |
| Each Twin already includes receipt access, documents, activity, care/source gaps and conditional evidence | `src/app/vault/[id]/page.tsx` | Refine the existing passport rather than creating a second product-detail system. |
| The document library has six saved documents and no search; rows omit the associated purchase date | `src/app/documents/page.tsx`, `DocumentList` | Document-first retrieval still needs a visible entry point and stronger purchase identification. |
| Two different headphones purchases exist | Actual saved library and STATUS | One card/page per **purchase**, not one merged card per product model. Dates and provenance must distinguish them. |
| North is already rooted above the page routes | `src/app/layout.tsx`, `src/components/careos/provider.tsx` | Keep that persistent host; navigation should not recreate the assistant. |

These are observations and design hypotheses. No task-time improvement, demographic preference or independent-user acceptance has been measured.

## 2. Research and how it applies

Sources accessed November 3, 2026. Established guidance is useful here; the publication dates below are not presented as new studies.

| Source | Relevant finding | Application to Pal Care |
| --- | --- | --- |
| [Nielsen Norman Group: Hidden Navigation](https://www.nngroup.com/articles/hamburger-menus/) — 2016 study, 179 participants, six websites | Visible navigation was easier to discover than hidden navigation; recommends visible links when there are few destinations. Mobile study compared hidden versus combination navigation. | Keep Home and Insights visible on phones. This supports visibility, **not** a claim that horizontal navigation universally outperforms a visible sidebar. The two-link header is a contextual design judgment. |
| [Baymard: Search Query Types](https://baymard.com/research-articles/ecommerce-search-query-types) — updated April 29, 2026 | Users search by product names/models and also expect non-product information to be searchable. | Support saved product and document metadata, especially “kettle receipt” and exact model searches. Ecommerce findings inform a hypothesis for an ownership library; sales/conversion results do not transfer automatically. |
| [Nielsen Norman Group: Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — 2024, reviewed September 2, 2026 | Nondefault tab content is less prominent; tabs are a poor fit when people need information together. Clear headings can be more appropriate. | Use visible product sections and local jump links initially. Keep receipt access and document availability visible without selecting a second tab. |
| [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — 2006 | Show frequent tasks first; make specialized details available through clearly labeled controls. | Prioritize products, receipts and relevant care. Put raw payment IDs and expanded evidence behind disclosures; keep source labels and missing-information summaries visible. |
| [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Ordinary content must reflow at an equivalent 320 CSS-pixel width without loss of functionality or two-dimensional reading. | Reflow the header, search, cards and reader. Native data tables may scroll within their own containers; that exception does not apply to the surrounding page. |
| [W3C: Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | AA target-size baseline is 24×24 CSS pixels with defined exceptions; focus must not be fully hidden by author content. | Retain Pal Care's stronger 44×44 primary-control target. Verify North and any sticky elements do not cover focused actions. |
| [W3C APG: Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) | In-page tabs are a particular widget with panel relationships and arrow-key behavior. | Home/Insights are ordinary navigation links, not ARIA tabs. Product jump links are anchors. Preserve native Insights' actual control semantics. |

## 3. Proposed experience

### A. Shared customer header

Desktop concept:

```text
PC Pal Care       Home   Insights                 Appearance   Explore
─────────────────────────────────────────────────────────────────────
Sandbox demo · Fictional customer · Sample + Verified Sandbox · No real money
```

- Put the logo, two primary links and utilities in one row when space permits. Brand links to Home.
- Use a strong active indication, such as bronze underline plus weight, with correct navigation semantics. Purchase/document/care routes belong to Home; Insights has its own active destination. Unrelated secondary routes need not falsely claim to be Home.
- Mobile: brand and a labeled **More** utility disclosure on the first row, **Home / Insights** clearly visible on the second. More contains appearance and the existing Explore destinations. Main destinations never require that menu.
- Use normal-flow header placement initially; this avoids a large fixed header consuming enlarged-text reading space. Preserve skip navigation and a clear page heading.
- Keep the existing bronze/violet/slate identity, Inter typography and System-default appearance.
- Use one concise demo notice. Details remain expandable; Sample, Verified Sandbox, fictional customer and no-real-money meaning stay visible.

### B. Home: the collection first

```text
Your purchases, together.
Receipts, documents and available care in one place.

[ Search products and documents…                           ] [Search]
5 saved purchases · 6 documents                    All documents →
Category: All                                   Filters · Sort: Newest

[ dated purchase ]  [ dated purchase ]  [ dated purchase ]
[ dated purchase ]  [ reference item  ]

Relevant saved updates / recent activity
                                                     [Ask North ☆]
```

Counts above illustrate the current database, not fixed UI values. The reference record remains explicitly labeled and has no invented purchase amount.

- Replace the three large KPI cards with one wrapping summary line. Purchase totals/trends belong in Insights.
- Show every result in the current page of the collection; avoid a second “View all purchases” destination containing the same records. Use explicit pagination if needed, not infinite scroll.
- Three/two columns where readable; on narrow phones, compact horizontal cards with a thumbnail, product name, purchase date, amount/reference state and provenance. Do not force desktop-size artwork above the actionable information.
- Make the image/title region a real product-detail link with visible focus; avoid clickable `div`s or nested controls. Keep an optional direct **Receipt** link where a receipt exists. Document count links to that purchase's documents section.
- Prioritize one clear purchase-opening action. Use the global North launcher and the contextual product-page action rather than a large repeated assistant button on every card.
- Keep category visible. Put **Purchase source** (All / Sample / Verified Sandbox) and document-availability filters in a labeled disclosure with applied-filter chips, result count and Clear filters. Default sort is purchase date descending with a stable tie-break; reference dates remain labeled sample dates.
- Keep source-backed updates below the collection. Empty/unavailable data receives a specific state and a useful recovery action; a database failure must not become “you have no purchases.”

### C. Search and All documents

**Search contract:** this search finds saved records, not a conversational response. It works without AI access and uses no provider call.

- Search product name, brand, model and attached-document title/kind using bounded, normalized terms. Product snapshots remain authoritative where present. “Kettle receipt” must return the exact receipt and its associated purchase.
- Search results group **Purchases** and **Documents** under clear headings, with exact links and readable result counts. A document match can also expose its parent purchase; duplicate document rows are deduplicated by document ID.
- A document row includes title, kind, associated product, purchase date and **the document's own provenance**. A sample policy attached to a Verified Sandbox purchase remains a sample policy. **Purchase source** filters the parent purchase in both result groups; it never changes the document's label or means “verified documents.”
- **All documents** is a prominent Home link to `/dashboard?view=documents`, displaying the saved-document list inside the same Home shell. It can be reached without knowing a product name or typing into search.
- Global search submission from either Home view uses `/dashboard?q=…` and shows both result types; category/provenance filters remain visibly applied. Clearing search returns to the product collection. The document view has a visible **Your purchases** return link. Preserve view/query/filter/sort/page state in validated URL parameters.
- Use a normal search form and explicit results first; autocomplete is unnecessary for this five-record collection. Match case/spacing/punctuation variants and known document-kind terms. Broad fuzzy/natural-language search is not implied by the placeholder.
- Include no-match, no-saved-documents, missing-manual, partial-library and temporarily-unavailable states. A missing warranty document does not establish expired coverage. Official care guidance remains distinctly sourced and is not counted as a saved receipt/manual file unless it actually is one.
- Search scope must be explicit. Current ordinary reads are newest-100; North already has a separate 1000-record-plus-one completeness probe. Reuse the existing restricted saved-library read and provenance validation for the new read-only Home projection, with server-side result pagination. Do not silently search only the first visible page or describe capped/invalid evidence as a complete library. Native Insights retains its own declared window.
- This requires a small product/document search projection: the current `matchingRecords` function searches name/model/category, not document titles or kind. Reuse evidence rules and reads; do not route a search form through the conversation/interpreter endpoints or relabel existing chat search as an already implemented global search engine.

### D. Product detail: one useful passport

```text
Home / Pour-over kettle

[thumbnail]  Pour-over kettle · Hearth H-02
             Oct 12, 2026 · Sample amount $89.00 · Sample purchase
             [View receipt]  [Ask North ☆]

Overview     Documents (1)     Care & history     ← section jump links

Purchase details
Documents: receipt / saved policy / available files
Available care: exact-model guidance, or a clear evidence gap
History and relevant recorded outcomes
Payment/source details [expand]
```

- Refine `/vault/[id]`; maintain one page per dated Purchase Twin, including repeated purchases of the same model.
- Keep the passport identity and original artwork, with a smaller summary and receipt action before large decorative content. On mobile, show the identifying facts and receipt action before any large image.
- Use **Overview / Documents / Care & history** as local jump links above visible sections, not hidden panels. Keep browser find, deep links and ordinary scrolling useful. Technical evidence can use disclosures.
- Rename vague headings such as “The paperwork” to **Documents** where clarity improves navigation. Explain Purchase Twin as secondary product language, not the main task label.
- Show relevant existing adjustment/safety outcomes and limits in context; unknown warranty/manual/recall status stays visible near the relevant information. An empty care section must explain what evidence is missing.
- Keep `/vault/[id]/care` as the detailed source-guidance destination, reachable from the product hub. Its exact-source attribution stays intact.
- Back to Home and browser Back should restore the query, filters and reading position. Validate any explicit return target to known internal library/Insights paths; a URL parameter is never an arbitrary redirect or authority.

### E. Document reader

- Preserve `/documents/[id]` and the existing text download URL.
- Provide a clear parent-purchase breadcrumb and product/date/provenance context. A saved search remains recoverable with browser Back.
- Use a comfortable reading width and responsive padding; keep **Download text** and **Ask North about this purchase** near the document heading rather than below a potentially long document.
- Distinguish **Open** from **Download** visually; the current library's Open control uses a download icon even though it navigates to the reader.
- Keep original document content untouched and its actual format explicit. A decorative paper frame must not suggest a PDF, verified warranty or signed certificate that does not exist.

### F. North and Insights continuity

- Keep one root North provider, its original histories/drafts/recovery identities and a single persistent floating launcher. Reposition the mobile launcher after removing the bottom bar, with safe-area and content clearance.
- Wide screens should reflow the collection/reader alongside North. Retain deliberate modal behavior on small screens, with close/Escape/focus restoration and readable composer/answer space. Size product grids using their available content width so an open panel does not leave three cramped cards.
- Preserve explicit selected purchase context. On a different product page, **Ask North about this purchase** explicitly selects that exact Twin without submitting a question. Ordinary navigation must not silently overwrite an explicitly pinned purchase or relabel old answers; show the current scope and existing Change/clear controls.
- Home search/filter state is separate from North's conversational scope. A search must not silently pin the assistant, reset its conversation or execute an Insights action.
- Carry `WorkspaceNavigationLink`'s departure behavior into header/Home navigation. Delayed native actions must not pull someone back to Insights after they have chosen a product or document.
- Insights retains **My Purchases / Documents & Care / Price Adjustments**, native AG Studio grid/chart/KPI, custom evidence, real cross-filtering and validated browser-local layouts. Verify the new shell with native state read-back and visible scoped data, not an emitted success event.

## 4. Routes, implementation dependencies and delivery

### Route contract

| Existing entry | Proposed behavior |
| --- | --- |
| `/dashboard` | Canonical Home collection/search/document view |
| `/vault?q=…&category=…` | Compatibility redirect to Home, preserving validated supported search/category parameters; no redirect loop |
| `/documents` | Compatibility redirect to Home's document view |
| `/vault/[id]`, `/vault/[id]/care` | Existing identity-preserving detail routes, visually within Home |
| `/documents/[id]`, `/api/documents/[id]/download` | Existing exact document and download routes |
| `/insights` | Existing analytics destination and native workspace |

Use reversible temporary redirects during initial acceptance. Historical North links remain meaningful; no stored answer, UUID, document or source reference is rewritten. Update current in-app links deliberately. Preserve modified-click/new-tab behavior, query validation, unknown-ID errors and browser Back/Forward.

### Existing foundation to reuse

Next `16.4.2`, React `19.3.1`, Tailwind `4.3.3`, existing Radix dialogs, lucide icons, next-themes, Zod and pinned AG Studio `3.0.0` already cover the design. No new framework, search service or UI-kit dependency is needed.

| Work area | Expected files/contracts |
| --- | --- |
| Header, selection and mobile layout | `src/components/shell.tsx`, `src/lib/customer-navigation.ts`, `src/app/globals.css` |
| Home library and read-only search | `src/app/dashboard/page.tsx`, `src/components/vault.tsx`, a small typed library-query/presentation module using `src/lib/demo/repository.ts` and existing evidence validation |
| Compatibility routes | `src/app/vault/page.tsx`, `src/app/documents/page.tsx` |
| Product/document hierarchy | `src/app/vault/[id]/page.tsx`, `src/app/documents/[id]/page.tsx`, relevant care-page links |
| Assistant/shell integration | Existing `src/components/careos/provider.tsx` host, layout CSS, `src/components/intelligence/workspace-navigation-link.tsx` |
| Meaningful regressions | Navigation unit tests; library search/provenance tests; foundation, customer-navigation/reflow, North continuity, Insights and compatibility browser coverage |
| Approved contract and evidence | New navigation ADR; AGENTS, README, PRODUCT, DESIGN, CUSTOMER-FIRST-PLAN, applicable API/architecture route notes, STATUS and reviewed screenshots |

**One vertical slice:** Home → correct dated purchase → exact receipt/care → Home, with two-link header and persistent North. Internal delivery order is header/library/search, product/reader refinement, then integrated continuity/acceptance. These are dependencies within one approved scope, not calendar milestones or automatic repeated approval stops.

## 5. Acceptance evidence required

| Customer task / regression | Pass condition |
| --- | --- |
| First visit | Home and Insights are immediately visible on desktop/phone. At 390×844 with ordinary text and North closed, the first product's name, purchase identity and opening action are visible without scrolling. Capture before/after; do not shrink text to pass. |
| Browse everything loaded | The current database's five distinct purchases and six documents remain reachable, with counts derived from data. Fixture mode uses its own actual records/counts. Two headphones purchases remain separate. |
| Find a known receipt | Search `kettle receipt`; open the correct dated receipt directly from results without North or an intermediate product page. |
| Disambiguate duplicates | `headphones receipt` exposes the two correct dated receipts and their distinct provenance; choosing one never opens the other's document. |
| Document-first retrieval | Reach All documents from Home in one action. Document rows identify their parent purchase and own provenance; missing manuals/warranties are not invented. |
| Search correctness | Unit/dedicated-DB cases cover combined tokens, model/name/brand/title/kind matching, normalization, filter composition, zero results, malformed/oversized parameters, duplicate IDs, snapshot identity, completeness limits and inaccessible/unrelated records. Search beyond the first result page still finds matching loaded records. |
| Product-first retrieval | Home → product → receipt is at most two navigational activations after identifying the purchase. Receipt and available-care actions are discoverable on mobile before oversized artwork. |
| Navigation memory | Query/filter/sort/page and usable scroll/focus return through product/document navigation and Back/Forward. Legacy list URLs preserve supported parameters; direct detail/download links still resolve. |
| North continuity | Draft/history and per-answer scope survive Home → Twin → document → Insights → Back. Explicit pinned context is visible; contextual Ask selects the intended Twin without auto-send. No stale native action hijacks navigation. |
| Native Insights | All three views, grid/chart/KPI, filters/cross-filters and layout save/restore remain correct with the new shell and North open. Record actual SDK state and corresponding rows/aggregates. |
| Accessibility and responsive behavior | Keyboard-only operation, landmarks, focus order/return, screen-reader names, 44px primary targets, contrast, reduced motion, 320px reflow, 200% text and 400%-equivalent zoom. Review 390/834/1440 widths in Light/Dark/System, North open/closed/expanded and mobile keyboard states. Native table scrolling stays local. |
| Honest failure states | No results, no documents, library unavailable/partial, missing care, AI unavailable and unknown in-flight work remain distinguishable. Direct search/navigation/theme controls trigger no model or financial dispatch. |

### Verification sequence

1. After approval, assemble a frozen implementation and meaningful domain/route/continuity regressions. Update screenshot baselines only after reviewing the intended changes; preserve existing tolerances and failure evidence.
2. Coordinate one verification window in the primary checkout: lint, formatting, typecheck, units and build; dedicated PostgreSQL tests only with an explicit `TEST_DATABASE_URL`; relevant fixture/database browsers, accessibility, failure/recovery and Firefox/WebKit checks.
3. Capture the actual implemented Home, Twin, document list/reader and Insights in Light/Dark at desktop/mobile widths with North open and closed. Distinguish isolated observation from the running private preview and exact-commit CI.
4. Record exact-SHA CI. Coordinate any approved preview replacement through bounded stop/build/start and recovery procedures; never rebuild active `.next` assets in place.
5. Obtain owner task-based review on the actual private site. With participants available, run a short moderated check with a small varied group using the receipt, duplicate-headphones, document-first and Insights tasks. Record task completion, first choice, wrong-document selections and backtracking. Small-sample findings are directional, not demographic or statistical proof.
6. Compare against the baseline rather than declaring success from screenshots alone. Any participant who cannot find documents without coaching triggers another discoverability iteration. Owner acceptance and real-device keyboard/IME review remain explicit gates.

## 6. Authorization, constraints and handoff

The requested approval is for this navigation/library/product-reader implementation scope and its relevant verification. The exact two-link navigation change needs owner acceptance because it revises the current project contract. Preview replacement needs a coordinated owner-approved window under [WORKSPACE](WORKSPACE.md). Participant recruitment/real-device review depends on availability.

The slice reuses existing read-only application services, source records and authorization. It requires no application migration, credential provisioning, financial experiment, public deployment or license activation. Existing original credentials, purchase evidence, deadlines, paid-credit settings and accounting remain authoritative. A later useful live North acceptance call is permitted only after checking the actually valid existing grant and remaining allowance; this research task makes none. Search and document retrieval must work independently of that grant.

Conservative submission cutoff remains **November 12, 2026 at 12:00 PM PST**; judge access is required through **December 15, 2026**. Actual authorization and license expiries still apply. No intermediate engineering dates or readiness claims are created here.

### Planning handoff

- **Implemented:** this research-backed proposal, source audit and read-only baseline observation packet.
- **Verified:** workspace/runtime identity and ten actual-HTTPS page observations; external guidance reviewed. Repository baseline verification passes (32 required files); all seven local Markdown links resolve and all five handoff sections/pending-approval status are present. These are static documentation checks, not redesigned-application tests; no application suite/build or new exact-commit CI was run for this planning change. Historical exact-commit CI in STATUS is separate.
- **Incomplete:** proposed UI/search implementation, new isolated/integrated/exact-commit CI evidence, comparative usability results and owner/real-device acceptance.
- **Blocked:** no remaining routine implementation/push/private-deployment approval gate. Actual verification failures must still be resolved; external/public/financial permissions remain separate.
- **Next:** implement the approved Home → dated purchase → receipt/care journey, verify the complete slice and exact-commit CI, deploy automatically with rollback protection, then obtain the owner's hands-on feedback on the main private site.
