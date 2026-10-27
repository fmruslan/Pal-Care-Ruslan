# CareOS focused UX increments

Date: 2026-10-27. Three owner-approved increments: conversation reliability, purchase-aware answers, focused visual/accessibility polish. User separately permits up to 50 new genuine Sol Medium requests if useful; this is an upper bound, not a requirement to spend them. Prior journals/unknown outcomes remain intact; no new allowance or inference has been used for this UX work yet.

## Increment 1 — conversation reliability

Implemented: immediate submitted bubbles; one original request envelope; truthful pending/unavailable/uncertain states; GET-only saved-answer recovery; Enter/Shift+Enter and composition/repeat guards; draft retention; restoration/clear exclusion; long-answer beginning; upward-scroll pause/Jump to latest; in-memory close/reopen position. Both typed shortcut-label questions and shortcut clicks remain visible.

Changed files: `src/components/careos/provider.tsx`, `src/components/careos/conversation-client.ts`, `src/components/careos/use-conversation.ts`, `src/components/careos/use-conversation-scroll.ts`, `src/app/globals.css`, `tests/e2e/careos-interaction.spec.ts`, `tests/unit/careos-conversation-client.test.ts`, `playwright.compat.config.ts`, `README.md`, `docs/API.md`, `docs/CAREOS.md`, `docs/DESIGN.md`, `docs/STATUS.md`, this ledger, and `tests/e2e/visual/{desktop-light,desktop-dark,tablet-light,tablet-dark,mobile-light,mobile-dark}/assistant.png` (six files). No server/domain contract, provider or database change belongs to this increment.

Controlled browser tests hold response delivery until assertions prove pending render order, rather than depending on a millisecond latency threshold. Injected failures include absent results and terminal unavailable results saved before an HTTP error. These are UI/transport regressions, not model or PayPal evidence.

An independent coding-agent review reproduced two defects before release: reattaching a resize observer could return a long answer to its beginning during ordinary rerenders, and keyboard activation of a disappearing Jump control could leave focus on the page body. The observer now attaches with the transcript and responds only to actual viewport-size changes without restarting on each render; explicit Jump/manual recovery focuses the transcript before its control can disappear, without summoning a mobile keyboard. Regressions cover both. This is agent-assisted code/browser review, not independent human usability research.

Isolated verification: **84/84** targeted Chromium checks across desktop/tablet/mobile × light/dark; **14/14** focused Firefox/WebKit interaction checks. Increment 1 adds four unit cases to the 366 baseline; the shared tree (including separately prepared later-increment tests) passes all **398** units, lint, typecheck, build and formatting. Earlier full Chromium passes exposed reopen-clamping and modal-focus defects; fixes passed **3/3** focused desktop/tablet/mobile long-answer reruns and then the complete **84/84** rerun. All six updated assistant screenshot references were inspected before the final finish increment. Earlier failures are retained, not counted as passing acceptance. Exact pushed commit/CI is recorded at delivery; actual private-preview UX acceptance remains pending.

## Increment 2 — purchase-aware answers

Not yet accepted. Required: explicit authorized inline choices with date/provenance, original question retained, no cross-purchase receipt substitution, one primary answer action and discoverable secondary actions/evidence. No provider-prompt or broad model-routing changes.

## Increment 3 — focused finish

Not yet accepted. Required: Blue/Lavender hierarchy, readable conversation text, primary touch targets, minimal desktop placement change, mobile visible-viewport handling, light/dark/reduced-motion/reflow checks and screenshot inspection.

## Evidence boundaries / remaining limitations

- No live-model UX acceptance or private port-3002 rebuild yet. Original port 3000 and application history remain untouched.
- Read-only actual-environment preflight passes: original 17 readable source-table digests, three original CareOS rows and 0015/29-table schema are preserved. Subscription metadata remains 25/50 used, two unknown outcomes retained, unblocked, original expiry `2026-10-28T16:42:26.459Z`. No new request or allowance reset.
- Injected composition/key events and mobile/browser emulation are not real IME/keyboard/device tests. Axe is not a full accessibility certification.
- A pending question blocks further sends until a canonical result or explicit successful clear. Server leases remain authoritative. No automatic turn retry or background poll.
- Browser storage is optional and holds only a bounded per-tab fictional question recovery hint, not credentials or authorization. Denied storage cannot preserve an uncertain question across reload.
- Advanced exact reading-position restoration across reload/reflow/browser engines remains deferred. No new financial action, account system, migration, paid API fallback or public deployment.

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
