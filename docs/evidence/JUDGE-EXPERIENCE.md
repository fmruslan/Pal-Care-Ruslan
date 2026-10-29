# Customer and judge experience review — 2026-10-29

## Implemented

Screenshot-backed review of the actual private database application, including a
fresh browser with no owner scopes. This review proposes priorities; it does not
implement a redesign or establish public readiness. The narrow Home/Studio fixes
and their acceptance ledger are in [MOBILE-BASELINE](MOBILE-BASELINE.md).

## Verified — actual application observations

Evidence root (private, outside Git):
`/tmp/opencode/palcare-baseline-20261029T070318Z/`.
Screenshots below use `actual-desktop-light-` and `actual-mobile-dark-` prefixes.
These are browser observations/emulation, not physical-device or human judge tests.

| Journey | Observation | Screenshot suffix |
| --- | --- | --- |
| `/` → `/dashboard` | Clear purchase-aftercare story, visible explore action, no registration. Home provides direct purchase/document/care entry points. | `fresh-landing.png`, `home-390.png` |
| `/vault` → saved Twin | Five records: four labeled samples/reference records, one original verified $129 Sandbox purchase. | `fresh-verified-twin.png` |
| `/documents` → receipt | Six documents, explicit provenance and working original receipt/Twin links. | `fresh-documents.png`, `fresh-verified-receipt.png` |
| `/insights` | Three views, native grid/chart/KPI, evidence widgets, shared filtering and browser-local layout controls. | `fresh-insights.png`, `fresh-documents-care.png` |
| `/insights`, Price Adjustments | Actual verified refunds are **$0.00**; proposals are not presented as savings. | `fresh-adjustments.png` |
| Raspberry Pi care | Attributed saved official excerpt is available, with reference-sample scope. Headphones correctly lack supported manufacturer guidance. | `fresh-pi-care.png`, `fresh-missing-manual.png` |
| Fresh CareOS | Server denies missing owner scope before creating a conversation; the UI combines “Demo · no live AI” with an unavailable/expired access error. | `fresh-careos-access.png` |
| Missing Twin / disabled checkout | Visible missing-record and disabled-checkout states; no payment request. | `fresh-not-found.png`, `fresh-checkout-disabled.png` |

Exact useful paths:

- Verified Twin: `/vault/21301174-dcfa-4e19-b5cc-18f21e745700`
- Original receipt: `/documents/aee87787-6493-4e6d-8b48-175317fc1be5`
- Reference care: `/vault/00000000-0000-4000-8000-000000000204/care`
- Missing guidance example: `/vault/00000000-0000-4000-8000-000000000201/care`

Suggested short owner walkthrough: Home → original Sandbox headphones Twin →
receipt → Insights / My Purchases → select **Audio** and inspect matching records
→ Documents & Care / Raspberry Pi reference → Price Adjustments (**$0.00**).
Separately resize/move a widget, save, reload and restore. Open/close CareOS and
inspect its access state without sending a prompt. This tests the current UI and
evidence story without a financial or inference request.

The first `fresh-home` capture at `d535707` caught server loading and was retained
as such; stable six-width Home captures establish the rendered layout. Later
captures explicitly wait for the page heading. Full-page screenshots place fixed
controls at the captured viewport position; ordinary scrolling remains necessary.

## Ranked improvements for owner selection

1. **Clarify the fresh CareOS entry state.** The prominent assistant invitation
   currently leads an unpaired visitor to an access error while its badge says
   demo. Explain what assistance is available before inviting input, with one
   useful next action. Acceptance: a fresh visitor understands the mode and can
   complete a documented purchase task without owner pairing or misleading AI
   claims. Evidence: `fresh-careos-access.png` and actual 403 observations.
2. **Bring the Insights result closer to entry.** On mobile, introductory copy,
   provenance notices, invitation, view/filter controls and layout controls put
   the first KPI/chart well below the first screen; the fixed-height Studio area
   adds an inner scroll region. Acceptance: owner can find the purchase count,
   select a category and open its receipt with less searching, while all source
   labels and accessible alternatives remain. Evidence: `fresh-insights.png`.
3. **Use customer language around controls.** “Studio scope”, “current Studio
   selection”, “widget” and vendor evaluation details compete with purchase tasks.
   Preserve honest evaluation/source disclosures while giving customer actions
   plain labels. Acceptance: first-time owner explains the three views and the
   difference between filtering and layout customization without a walkthrough.
   Evidence: `fresh-insights.png`, `fresh-adjustments.png`.
4. **Make the strongest evidence journey easier to discover.** The original
   Sandbox receipt and the useful reference-care excerpt are real strengths, but
   a generic demo entry does not immediately guide a judge through them. Favor a
   short optional demonstration path over additional features. Preserve sample,
   Sandbox and unavailable-guidance distinctions. Evidence: `fresh-landing.png`,
   `fresh-verified-receipt.png`, `fresh-pi-care.png`.
5. **Make external-source availability clear.** Raspberry Pi's official shutdown
   URL returned **403 / “Just a moment…”** to both fetch and Chromium. The saved
   attributed excerpt works; a human browser opening the official page is still
   unverified. Preserve the original source link and identify the saved excerpt
   clearly. Evidence: `official-source-browser.json`, `fresh-pi-care.png`.

## Blocked — future public judge access

The smallest recommended future path is **one isolated Render Next.js service +
Managed PostgreSQL**, with HTTPS, fixed fictional scope, restricted reader/CareOS
roles and migrations run only from a separately approved operator environment.
Do not expose the owner preview or copy its subscription credentials/conversations.
`render.yaml` is a starting configuration, not an accepted deployment.
Before using it, reconcile its Node pin with `.node-version`, verify plan capacity
and cost, exact HTTPS origin, readiness, runtime-file isolation and actual roles.

Use labeled samples and, only after a separately approved sanitized export,
the original historical Sandbox evidence. Do not fabricate completed captures or
copy provider credentials. Keep checkout/refunds/provider refresh off. A reliable
minimum demo can use explicitly labeled scripted CareOS examples executing real
SDK actions, plus a dated recording of previously verified genuine AI. Public
live AI needs distinct approved credentials, budget/accounting, abuse controls,
schema/expiry decisions and external acceptance; the private subscription window
does not grant judge access.

Current `src/lib/intelligence/access.ts` permits exact loopback origins only.
Public Studio needs an approved licensed-origin path and vendor-key integration.
The vendor's [licence installation](https://www.ag-grid.com/studio/react/licence-install/)
and [Enterprise terms](https://www.ag-grid.com/studio/react/enterprise-licence/)
permit local evaluation and state that Studio covers its built-in grid/chart
widgets, not standalone Enterprise instances. No licence/trial was activated.
A 45-day trial activated October 29 would end around December 13, before the
required **December 15, 2026** judge-access horizon. Confirm actual expiry and
AI-feature coverage before activation. The conservative submission cutoff remains
**November 12, 2026 at 12:00 PM PST**.

## Incomplete / Next

Owner Mac and real-device review, fresh live provider/token-refresh acceptance,
licensed public hosting/isolation and judge access remain separate gates. Next:
owner tests the private baseline and chooses the first UX improvement above;
before any deployment, separately approve hosting cost, dataset, licence, model
mode/budget and exact exposure scope. Preserve a short captioned video/text
walkthrough as a fallback; a recording does not establish live judge access.
