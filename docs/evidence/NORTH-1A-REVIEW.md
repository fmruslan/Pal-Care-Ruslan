# North ☆ 1A — consolidated owner review

**1A is implemented; exact-commit CI and automated browser/recovery verification pass. Acceptance remains incomplete.** The requested additional 50 genuine completions stopped at **17 completed + one unknown attempt**. Owner/real-device review remain separate gates. **The working private preview is unchanged; 1B is not authorized.** [Implementation truth](../STATUS.md) · [detailed findings/accounting](NORTH-1A-FOLLOWUP.md) · [initial packet and retained failure history](NORTH-1A-REVIEW-INITIAL.md).

## Implemented

- North ☆, pronounced **North Star**, within Pal Care: outlined star/violet accents, compact header/overflow, neutral response/composer surfaces and no assistant “Powered by” attribution.
- Searchable/removable **dated purchase context** and direct dismissible choices; persistent product context stays distinct from each question's scope.
- One visible care/Insights timeline; drafts/context/history survive navigation, close/reopen and expansion. Underlying owned server conversations and original request/recovery IDs remain separate.
- An honest 1A library-task guard, including linked-list/CSV wording, prevents one selected purchase's amount being presented as a library total. It does **not** implement library queries, totals or export.
- Expired/pending-only Clear recovery retains uncertain work until owned deletion succeeds. Recovered native plans require explicit SDK application; neither recovery nor expansion replays a model POST.
- Pinned **AG Studio 3.0.0** native value-resize/grid-lifecycle patch, plus stronger hydration/navigation regressions. Native widgets, mappings, license notices, error assertions and navigation deadlines remain intact.
- Exactly **50 additional automated regressions**, one incomplete-HTTP-200/no-replay regression and three tests of the actual native grid core. All nine original AI flags individually classified; old outputs/scores unchanged.

**Customer outcome/gate:** reliable 1A purchase-assistant interaction, reusing the existing monolith, fixed fictional scope, Purchase Twins, native Insights and protected transport/accounting. No 1B capability, application migration, production credential provisioning, financial operation, paid fallback or public exposure was added.

## Screenshots and actual UX observations

Final runtime-source capture: **2026-11-02T22:42:31.680Z**, isolated fixture **production app**, desktop **1440×1000**, mobile **390×844 Chromium emulation**. Not mockups, the working private preview, or a real phone.

| Presentation | Light | Dark |
| --- | --- | --- |
| Desktop | [Welcome](north-1a/desktop-light-welcome.png) · [Receipt](north-1a/desktop-light-receipt.png) | [Welcome](north-1a/desktop-dark-welcome.png) · [Receipt](north-1a/desktop-dark-receipt.png) |
| Mobile | [Welcome](north-1a/mobile-light-welcome.png) · [Receipt](north-1a/mobile-light-receipt.png) | [Welcome](north-1a/mobile-dark-welcome.png) · [Receipt](north-1a/mobile-dark-receipt.png) |

[Four-profile overview](north-1a/welcome-sheet.png) · [searchable context](north-1a/context-sheet.png) · [receipt response](north-1a/receipt-sheet.png) · [same conversation expanded](north-1a/expanded-sheet.png) · [request/error observations](north-1a/observations.json).

Coding-agent visual inspection covered all **16 captures**:

- Pal Care remains the primary shell identity; North is compact and secondary. Both themes retain readable neutral transcript/composer surfaces and clear bronze receipt/violet assistant controls.
- The search dialog shows **Everyday headphones · F-01 / Oct 18, 2026 / Sample / PC-000201**; Cancel and Remove remain visible. Searching/selecting context does not submit a question.
- The receipt response retains the same dated Sample scope, labels **“From saved records · no model call”**, and links the exact saved receipt. Context and question-scope metadata repeat deliberately; no incorrect payment-verification label appears.
- Mobile context, response/action and composer fit the captured viewport without clipping; expanded mode increases transcript room and preserves the answer. This does not prove real-device keyboard/IME behavior.
- Discovery still exposes later library tasks; those produce an explicit 1A limitation rather than actual results. Expanded mode is the **same conversation**, not an expanded native analytics workspace.

Each profile made one bounded conversation bootstrap, one context GET and one deterministic receipt turn. **Zero model calls, financial/external attempts, uncaught page errors or additional expansion requests.** Sources remain collapsed in these images; complete source/SDK assertions are separate browser evidence. Agent inspection is not independent human usability research.

## Verified

### Isolated tests and actual isolated-application observations

| Evidence | Actual result / boundary |
| --- | --- |
| Lint / typecheck / units / production build / formatting | Pass; latest **1,109 units / 58 files** include two CI guards, build **`IM1fwGc4WUebCTlseIwt1`**. Capture uses clean `3bc26db2d6a4ffffc03298be2dfa609ad20c8014` build **`Cmf1mTvvYelZ9l1wZt-xu`** (1,107 units / 57 files). Same runtime hash **`93f8de2b9e8fa1315ec12858d12f94ef09053151247c4104db38272cb9f728e8`**, Node 22.23.3. Later CI/tests/reference/docs changes do not change runtime source. |
| Deterministic / offline evaluation | **70/70 + 14/14**, zero inference/financial calls. |
| Dedicated PostgreSQL | **7/7** migration/seed integrity baseline; **113/113** integration and **2/2** real-server failure/disposable-role cleanup in follow-up. No application DB credentials or guard bypass. |
| Firefox/WebKit compatibility | **108/108**, ordinary final-source run, no retries; original three WebKit and later two Firefox failures now pass. |
| Complete fixture browsers | **220/220** desktop-Light/mobile-Dark. |
| Other-profile North / choices / held-import navigation | **72/72**, desktop-Dark/mobile-Light/tablet-Light/tablet-Dark. |
| Ordinary visual / official-source comparisons | **36/36**, all six profiles. |
| Owner-access browsers | **33/33**, Chromium/Firefox/WebKit, disposable synthetic identities/host state. |
| Recovery / expiry / actual native SDK | **14/14**, explicit dedicated `TEST_DATABASE_URL`, injected model protocol and actual isolated server/SDK; not real-provider acceptance. |
| Corrected database Insights references | **6/6** ordinary comparisons on current runtime, all six profiles; only four reviewed desktop/tablet references updated, both mobile references unchanged. No tolerance/assertion change. |
| Actual isolated application capture | Four final-source journeys / **16 reviewed screenshots**; zero model/financial/external attempts or page errors, zero-request expansion. |

These runs overlap in coverage; counts are not a claimed number of unique scenarios. All final isolated browser phases used **zero retries**. Commands, logs and archived artifacts: `/tmp/opencode/palcare-north-1a-verification/evidence/final-stable-integrated-results.json` and `final-database-insights-six-profiles.json`.

### Exact-commit CI

Complete review/CI revision **`87bd6a622afc27f5b0d53590ece5578777040b08`**, [run 41540894858](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41540894858): **SUCCESS**, both `foundation` and `native-acceptance`, every stage completed. Foundation finished **2026-11-02T23:21:46Z** (29m07s); native acceptance finished **23:07:38Z** (15m). **Zero retries/flaky/skipped cases observed.**

CI passed lint/format/typecheck/**1,109 units / 58 files**, deterministic/offline review, **113 integration tests in each independent database**, builds, **two failure/cleanup / 660 fixture / 660 database / six Guardian / 33 access / 108 Firefox-WebKit / 14 injected-protocol recovery** checks. Test coverage overlaps; the duplicate integration setup is not a new scenario set. This proves exact-commit automated acceptance, not live-model/financial or real-device acceptance. The final screenshots and CI guards are included in this SHA. Later **outcome-only documentation changes** do not change runtime, tests, workflow or screenshot pixels and are not represented as this exact tested commit.

Implementation/reference commit **`5b640b54cd3cfccdcc970bd9ce2cd4164b654bb0`**, [run 41535096613](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41535096613): **cancelled at the existing 35-minute job limit**, not green. All prerequisites, **33 access / 660 fixture / 660 database / six Guardian** checks passed; compatibility logged **82** completions before interruption, with no assertion failure/retry recorded. The injected-protocol stage was **skipped**. Local full compatibility/recovery passes are not substituted for those missing CI results.

The complete access/compatibility/injected-protocol suites occupy a second **unconditional mandatory job**, with its own disposable PostgreSQL service/frozen build. Both jobs retain **35-minute limits** and all existing tests, browser deadlines, retries and provider-off flags. Two configuration regressions guard against accidental coverage/isolation weakening; static command comparison confirms no original commands were removed. Local lint/typecheck/1,109 units/build/format and YAML/Prettier checks pass; the complete two-job exact-commit workflow now passes independently. Runtime hash remains `93f8de2b…`; this delta is CI/tests/reports/screenshots, not a preview refresh or product change.

Retained earlier CI outcomes:

- `deceb77` / [41530652445](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41530652445): passed through fixture browsers; database browsers **656 pass / four stale Insights-reference failures**, including retry. Later Guardian/compatibility/Sol stages skipped.
- `06fc929` / [41533615931](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41533615931): failed formatting of the native lifecycle test; later verification stages skipped. Stable datasource-variable formatting fixed it without changing runtime/assertions.
- `3bc26db` / [41534436528](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41534436528): formatting/functional stages passed, then the same **656/four** stale-reference failure; later stages skipped. The four deliberately inspected replacements exist in `5b640b5`, not this older SHA.

### Genuine model results and preservation

- Original **160 completions / 151 strict passes / nine preserved flags**; all nine reviewed individually, four Medium scope errors and five Low minimality/rubric discrepancies. Corrections do not rewrite historical scores.
- New fixed batch: **17 known completions / 14 strict passes / three preserved discrepancies**; attempt 18 stopped at `pilot_completion_or_model_missing`, unknown usage retained; **32 cases never dispatched**. Both temporary sessions revoked. No replay, replacement, renewal/reset or paid fallback.
- Combined: **177 known completions, 165 strict passes / 12 discrepancies, plus one unknown attempt**. This is adapter/domain evidence over fictional records, not population accuracy, browser proof or independent human review.
- Known new usage: **12,666 input + 432 output = 13,098 tokens**; cumulative known batch usage **133,267 input + 5,286 output = 138,553 tokens**, including 90 reasoning tokens in output. Caches zero. Unknown-attempt usage and subscription dollar cost unavailable, never zero/refunded estimates.
- Final read-only preservation at **2026-11-02T22:45:14Z**: **18/18 protected baseline files/original ledgers unchanged**, original policy/event prefix/browser states retained, new stopped ledger hash unchanged. Standing accounting **181/300 reserved, 119 unreserved, one unknown**; unreserved allowance does not override the stop.
- Primary/isolated runtime and native patch match exactly; no verification runner remains active. Original preview PID **2510002**, cwd and protected build/ID remain unchanged. No application/financial DB suite was pointed at the working preview. Private evidence: `evidence/north-1a-final-preservation-and-source.json`.
- **Post-CI recheck at 2026-11-02T23:22:52Z** reconfirms all 18 immutable hashes, original policy/history/browser states, runtime hash, stopped ledger and preview PID. Standing accounting remains 181 reserved / one unknown. Evidence: `evidence/post-ci-final-preservation.json`; successful CI artifacts are archived under `evidence/ci-87bd6a6-artifacts`.

## Incomplete

- The requested **50 genuine completions**; the stopped ledger must not be extended/replayed or replaced.
- Independent owner acceptance and real-device keyboard/IME observations; exact-commit CI is now verified separately above.
- 1B library/date retrieval, conversational totals/trends, formatting-only reuse/provider-free conversation and expanded native analytics remain later capabilities—not shipped by the rename or these tests.
- The current private preview still serves its earlier build; this packet does not establish refreshed-private-app acceptance or live-provider recovery.

## Blocked

The **unknown provider completion** blocks further live evaluation under this task. Owner review/real-device evidence remain human gates. Preview refresh and 1B require separate exact owner approval; passing automation cannot authorize either. Financial operations, paid APIs, credential provisioning/application migrations, licensing and public deployment retain their independent approval boundaries.

## Next

Obtain the owner's **1A review decision** on this packet and the incomplete live-evaluation gate. Keep the preview and 1B unchanged until separately authorized; do not invent a replacement batch or engineering deadline. Conservative submission cutoff remains **November 12, 2026 at 12:00 PM PST**, with judge access through **December 15, 2026**, subject to actual authorization/license expiry.
