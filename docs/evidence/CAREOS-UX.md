# CareOS focused UX increments

Date: 2026-10-27. Three owner-approved increments: conversation reliability, purchase-aware answers, focused visual/accessibility polish. User separately permits up to 50 new genuine Sol Medium requests if useful; this is an upper bound, not a requirement to spend them. Prior journals/unknown outcomes remain intact; no new allowance or inference has been used for this UX work yet.

## Increment 1 — conversation reliability

Implemented: immediate submitted bubbles; one original request envelope; truthful pending/unavailable/uncertain states; GET-only saved-answer recovery; Enter/Shift+Enter and composition/repeat guards; draft retention; restoration/clear exclusion; long-answer beginning; upward-scroll pause/Jump to latest; in-memory close/reopen position. Both typed shortcut-label questions and shortcut clicks remain visible.

Changed files: `src/components/careos/provider.tsx`, `src/components/careos/conversation-client.ts`, `src/components/careos/use-conversation.ts`, `src/components/careos/use-conversation-scroll.ts`, `src/app/globals.css`, `tests/e2e/careos-interaction.spec.ts`, `tests/unit/careos-conversation-client.test.ts`, `playwright.compat.config.ts`, `README.md`, `docs/API.md`, `docs/CAREOS.md`, `docs/DESIGN.md`, `docs/STATUS.md`, this ledger, and `tests/e2e/visual/{desktop-light,desktop-dark,tablet-light,tablet-dark,mobile-light,mobile-dark}/assistant.png` (six files). No server/domain contract, provider or database change belongs to this increment.

Controlled browser tests hold response delivery until assertions prove pending render order, rather than depending on a millisecond latency threshold. Injected failures include absent results and terminal unavailable results saved before an HTTP error. These are UI/transport regressions, not model or PayPal evidence.

An independent coding-agent review reproduced two defects before release: reattaching a resize observer could return a long answer to its beginning during ordinary rerenders, and keyboard activation of a disappearing Jump control could leave focus on the page body. The observer now attaches with the transcript and responds only to actual viewport-size changes without restarting on each render; explicit Jump/manual recovery focuses the transcript before its control can disappear, without summoning a mobile keyboard. Regressions cover both. This is agent-assisted code/browser review, not independent human usability research.

Isolated verification: **84/84** targeted Chromium checks across desktop/tablet/mobile × light/dark; **14/14** focused Firefox/WebKit interaction checks. Increment 1 adds four unit cases to the 366 baseline; the shared tree (including separately prepared later-increment tests) passes all **398** units, lint, typecheck, build and formatting. Earlier full Chromium passes exposed reopen-clamping and modal-focus defects; fixes passed **3/3** focused desktop/tablet/mobile long-answer reruns and then the complete **84/84** rerun. All six updated assistant screenshot references were inspected before the final finish increment. Earlier failures are retained, not counted as passing acceptance. Exact pushed commit/CI is recorded at delivery; actual private-preview UX acceptance remains pending.

Exact commit **`c468341c97a3350cfac54093ab51256a66824710`** is pushed and [CI passes](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/40578851084), including the complete fixture and dedicated-PostgreSQL browser suites, PostgreSQL integrity tests, Guardian provider-double flow, compatibility and injected Sol/Studio checks. This is not actual external-provider acceptance.

## Increment 2 — purchase-aware answers

Implemented; acceptance in progress: explicit authorized inline radio choices with original purchase date/provenance/short ID, no default selection, a separate continue action retaining the question as a deliberate new scoped request, inactive historical choices, one primary answer action and **More options**. Receipt selection takes priority when present. Matching precedes the display limit. Date/amount answers lead with the fact, and missing manuals offer the current purchase’s saved documents. Consequential uncertainty and exact source-wording guards remain; no provider-prompt or broad model-routing changes.

Files: `src/lib/careos/contracts.ts`, `src/lib/careos/service.ts`, `src/lib/careos/tools.ts`, `src/components/careos/provider.tsx`, `src/components/careos/purchase-choices.tsx`, `src/components/careos/answer-actions.tsx`, `tests/unit/careos-purchase-choices.test.ts`, `tests/e2e/careos-purchase-choice.spec.ts`, `playwright.compat.config.ts`, `README.md`, `docs/STATUS.md`, `docs/API.md`, `docs/CAREOS.md`, `docs/DESIGN.md`, this ledger and `tests/e2e/visual/{desktop-light,desktop-dark,tablet-light,tablet-dark}/assistant.png` (four files; mobile references do not expose the primary action at the captured reading position). Fifteen new domain regressions pass; the full shared development tree passes 398 units. **18/18** six-project purchase-choice/source browser checks, **4/4** Firefox/WebKit choice checks and **6/6** additional explicit-choice screenshot runs pass. Desktop-light/mobile-dark inline choices and representative primary-action screenshots were inspected. Build/lint/typecheck and increment-scoped formatting pass (a full formatting run remains pending on the separate in-progress live-acceptance script). No genuine model or financial request was used.

## Increment 3 — focused finish

Implemented; acceptance in progress: 16px-relative conversation bodies/steps/composer, compact lavender execution chips, Blue/Lavender header and submitted bubbles, visible Send text, wrapped product labels, 44px primary targets, compact desktop lane at ≥1440px and element-local mobile VisualViewport sizing. Zoom/blur cleanups leave no shared-root viewport overrides. Optional shortcuts yield reading space on ≤360px screens or detected keyboard use. Fixed padding/icon geometry does not suppress text enlargement.

Files: `src/components/careos/provider.tsx`, `src/components/careos/purchase-choices.tsx`, `src/components/careos/use-visible-viewport.ts`, `src/app/globals.css`, `tests/unit/careos-viewport.test.ts`, `tests/e2e/careos-accessibility.spec.ts`, `tests/e2e/careos-interaction.spec.ts`, `playwright.compat.config.ts`, `tests/e2e/visual/{desktop-light,desktop-dark,tablet-light,tablet-dark,mobile-light,mobile-dark}/assistant.png` (six files), `src/components/shell.tsx`, `src/app/vault/[id]/page.tsx` (minimal wrapping/grid/text fixes required by 320px/200% acceptance), `scripts/evaluate-careos-ux.ts`, `README.md`, `docs/CAREOS.md`, `docs/DESIGN.md`, `docs/SECURITY.md`, `docs/STATUS.md`, `docs/SUBSCRIPTION-DEVELOPMENT.md` and this ledger. All **398 units** pass, including thirteen viewport cases and keyboard-attribute cleanup. Initial presentation tests exposed keyboard reading-area and underlying-page text-reflow defects; the fixes pass the complete final fixture regression below.

Final verification passes **438/438** complete fixture Chromium browser checks and **38/38** complete Firefox desktop/WebKit emulated-mobile compatibility checks, including existing Studio/Stage-5 journeys. The initial new clipping detector incorrectly treated Firefox inline/closed-disclosure geometry as a client box; it now checks rendered visibility, real boxes and independent text-line bounds. The initial Chromium matrix passed **131/132**, with a 2px restored-bottom rounding value failing an unnecessarily strict `<2` harness threshold; the threshold is now ≤3px, not a reading-position behavior change. The full final regression passes with these corrections. All six refreshed assistant references plus 200% text, pending, uncertain recovery and explicit-choice artifacts were inspected. Lint, typecheck, build, formatting, diff checks and **70/70** deterministic/fixture tasks pass; production dependency audit reports no known vulnerabilities. No screenshot is financial or real-device evidence. Dedicated-PostgreSQL/final exact-commit CI is separately reported at delivery, not inferred from the fixture suite.

Exact increment-2 commit **`392e7bf859e8bdd24acc9e2bbc3c5aed82b22b10`** is pushed and [CI passes](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/40580389859), including complete fixture/dedicated-PostgreSQL browsers, PostgreSQL integrity, compatibility and injected Sol/Studio checks.

## Evidence boundaries / remaining limitations

- Private port 3002 is restarted with the final compiled UX. Actual acceptance below supersedes earlier pending-runtime checkpoints; port 3000 remains untouched.
- Read-only actual-environment preflight passes: original 17 readable source-table digests, three original CareOS rows and 0015/29-table schema are preserved. Subscription metadata remains 25/50 used, two unknown outcomes retained, unblocked, original expiry `2026-10-28T16:42:26.459Z`. No new request or allowance reset.
- Injected composition/key events and mobile/browser emulation are not real IME/keyboard/device tests. Axe is not a full accessibility certification.
- A pending question blocks further sends until a canonical result or explicit successful clear. Server leases remain authoritative. No automatic turn retry or background poll.
- Browser storage is optional and holds only a bounded per-tab fictional question recovery hint, not credentials or authorization. Denied storage cannot preserve an uncertain question across reload.
- Advanced exact reading-position restoration across reload/reflow/browser engines remains deferred. No new financial action, account system, migration, paid API fallback or public deployment.

## Actual private application acceptance

`scripts/evaluate-careos-ux.ts --run` passed **6/6 tasks**, in 57,765 ms total, against the actual database-backed, scope-authorized port-3002 application. It made no mocked backend responses. Only the first outgoing request was deliberately held to establish pending render order before forwarding it unchanged; that part is labeled controlled UI proof, not live latency proof. The existing protected shared journal is the sole usage ledger; the new append-only acceptance evidence does not replace any earlier pilot/quality record.

| Task | Evidence | Result | New Sol calls | Task elapsed |
| --- | --- | --- | --- | --- |
| Immediate pending question before forwarding | Controlled request hold, actual UI | PASS | 0 | 585 ms |
| Raspberry Pi 5 shutdown | Genuine inference; approved official source wording and attribution checked | PASS | 1 | 12,330 ms |
| Same-Pi follow-up | Genuine inference; same-Twin source isolation checked | PASS | 2 | 11,077 ms |
| Speaker → headphones clarification | Actual deterministic UI; both dated Sample/verified choices | PASS | 0 | 5,025 ms |
| Explicit verified choice → correct receipt | New UUID/scope, original question retained, matching saved receipt/Twin | PASS | 0 | 4,738 ms |
| Missing manual → this purchase’s documents | Actual deterministic missing state and useful scoped action | PASS | 0 | 6,074 ms |

Task timings include browser navigation/assertions and are not isolated provider latency measurements. The two genuine care turns consumed **3 total requests**; no fresh cap/session was created. Existing session is **28/50 used**, two earlier unknown outcomes retained, unblocked, original expiry **2026-10-28T16:42:26.459Z**. Zero blocked/financial requests, no retries, no transcript Clear, migration, paid fallback or public deployment.

Post-test preservation passes for 17 original readable source tables, three original CareOS rows, unchanged **0015 / 29-table** schema and legacy spending evidence. Readiness reports database/subscription with checkout/Guardian disabled. Credential/bundle verification passes (22 existing private browser artifacts checked; no private host files bundled). Long atomic-answer and software-keyboard behavior remain separately injected evidence; independent human/real-device acceptance still requires the owner’s review.

## Owner manual acceptance script (after preview refresh)

1. Open CareOS on a purchase. Identify supported tasks without typing.
2. Send a question with Enter. See the question immediately; type another draft while waiting.
3. Request/read a long care answer. Scroll up before completion; use **Jump to latest** and inspect Sources without losing focus.
4. From another product, ask about headphones. Explicitly choose the correct dated Sample/verified Sandbox purchase and continue without retyping.
5. Open the receipt and verify it belongs to that selected purchase.
6. Ask Raspberry Pi care questions and open the real supporting source.
7. Ask for missing Forma guidance. Verify the limitation and a useful saved-document next step.
8. Repeat core tasks with Tab/Shift+Tab/Enter/Escape and on a phone with its keyboard visible; check Light/Dark and enlarged text.

The UX freezes only after these tasks pass and the owner approves the experience. Judging access, actual refund/webhook acceptance, AG Studio licensing, video and submission remain separate work.
