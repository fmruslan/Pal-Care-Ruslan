# North ☆ 1A — owner review packet

**Owner-requested follow-up:** [individual nine-flag review, dedicated-database recovery, WebKit fixes, 50 automated cases and the stopped additional genuine evaluation](NORTH-1A-FOLLOWUP.md). It supersedes the older blocker snapshot below only where new actual evidence is recorded. The 50-call milestone is incomplete after 17 known completions and one unknown; no further inference/replay is permitted. Private preview and 1B remain untouched.

**Implemented; bounded verification finished with open acceptance gates. Private preview unchanged.** Chromium checks and screenshots pass; three WebKit compatibility failures remain unresolved, and the dedicated-database recovery suite could not start. North Star is Pal Care’s assistant, not a separate product. This report does not accept 1A or authorize 1B/preview refresh. Changes remain uncommitted/unpushed.

## Implemented

- North ☆ / accessible **North Star**, outlined star, **Ask North ☆ / Explore with North ☆**, no assistant “Powered by” attribution; bronze Pal Care/violet assistant identity retained.
- Compact header/overflow, persistent composer and one transcript scroll region.
- Searchable dated purchase context, direct selection/removal, dismissible one-click purchase clarification and bounded dismissal persistence.
- One visible care/Insights timeline; drafts and explicit context survive navigation, close/reopen, expansion and optional per-tab reload storage. Owned server histories remain separate; browser hints never become trusted transcript content.
- Exactly four optional discovery suggestions. They collapse after conversation starts, preserve existing drafts and disclose unimplemented library tasks rather than substituting a selected purchase’s price.
- Recovery preserves original request identity and usage. Clear now hydrates pending-only IDs even when expired/denied access prevented restoration; denial, active lease or uncertain delivery does not discard the recovery hint. Restored native plans never apply automatically.
- Missing-source care wording and explicit alternative-method labeling follow genuine-output semantic review. Original outputs and failed scores remain intact.

**Gate/dependencies:** approved 1A interaction foundation within the customer-first A–C sequence, reusing the existing monolith, Purchase Twins, source controls, native Insights runtime and protected transport/accounting. No framework, application migration, credential provisioning, financial/provider fallback or public exposure was added.

## Screenshots for review

Actual isolated fixture production app, recaptured from the final build at **2026-11-02T21:04:51Z**. Desktop **1440×1000**; mobile **390×844 Chromium emulation**, not a real phone. These are screenshots, not mockups and not the unchanged private preview.

| Presentation | Light | Dark |
| --- | --- | --- |
| Desktop | [Open screenshot](north-1a/desktop-light-welcome.png) | [Open screenshot](north-1a/desktop-dark-welcome.png) |
| Mobile | [Open screenshot](north-1a/mobile-light-welcome.png) | [Open screenshot](north-1a/mobile-dark-welcome.png) |

[Four-profile overview](north-1a/welcome-sheet.png) · [searchable context](north-1a/context-sheet.png) · [exact receipt](north-1a/receipt-sheet.png) · [same conversation expanded](north-1a/expanded-sheet.png) · [request/error observations](north-1a/observations.json).

All **16 captures** were visually reviewed by the coding agent. Context search focus was corrected from inherited bronze to violet, matching the approved North identity. Each profile made one bounded conversation bootstrap, one public context GET and one deterministic receipt turn. **Zero model calls, financial/external attempts or uncaught page errors; expansion made zero additional requests.** No human/owner acceptance is implied.

## Verified

| Evidence class | Actual result |
| --- | --- |
| Isolated lint/typecheck/units/build | Pass; **1,053 units / 55 files**. Final production source hash `f1f62ff36214ef72da90de4b7f20b111b2ace74660c8d1dc77cb0bf1ce90b2a9`, build `L1OexP4LbD6waGmLW2jNr`, Node 22.23.3. |
| Formatting | Pass. |
| Deterministic/fixture + offline evaluation | **70/70 + 14/14**, zero inference/financial calls. |
| Genuine fixture model calls | **160 completed and semantically reviewed**, original **54/60** + additional **97/100** strict passes; all nine flags and interpretative findings retained. |
| Observed token usage | **120,601 input + 4,854 output = 125,455**, including 90 reasoning tokens in output; caches zero. Subscription dollar cost unavailable, never estimated. |
| Accounting/access preservation | At 20:00:13Z: **163/300 used, 137 remaining, zero unknowns**, unchanged policy/limits. Four temporary evaluation sessions revoked; original sessions/history preserved by harness checks. |
| Preview/immutable-file preservation | **16/16** protected baseline hashes unchanged, including original `.env.local`, preview build/ID, expired historical journal and approval file. Only authorized provider registration/accounting paths are excluded from byte-equality. |
| Actual isolated application | Four Light/Dark desktop/mobile journeys, **16 reviewed captures**; exact sample receipt/context/mode and zero-request expansion observed. |
| Chromium fixture browsers | **216/216** complete desktop-Light/mobile-Dark suite; **64/64** North/purchase-choice checks in the other four profiles; **18/18** focused reflow/keyboard checks. |
| Ordinary visual comparisons | **36/36**, all six viewport/theme profiles, after deliberate reference review; no update flag or threshold relaxation. |
| Firefox/WebKit compatibility | Full run: **100 pass / four WebKit failures**. The menu clipping fix subsequently passes **2/2 focused Firefox/WebKit checks**; **three failures remain unresolved** (SDK ResizeObserver + two navigation cases). No overall green compatibility claim. |
| Owner-access | **33/33**, Chromium/Firefox/WebKit with isolated synthetic identities/host files. No real owner session renewed or allowance changed. |
| Injected Sol/recovery/expiry suite | **Blocked before test execution:** server refused to start without a dedicated `TEST_DATABASE_URL`. Its 14 configured cases, including the new pending-only expired-Clear regressions, are not claimed verified. No guard bypass or application database use. |
| Actual private application / exact-commit CI | **Not performed for 1A.** The preview is intentionally its previous build; changes remain uncommitted/unpushed. |

The isolated app is `/tmp/opencode/palcare-north-1a-verification/app`, inside network-disabled `palcare-north-1a-verification`; no actual credentials or preview `.next` assets were copied. Final source comparison confirms the primary checkout's `src/` and `public/` match the isolated app. All **16 immutable protected baseline files** remain byte-identical and original preview PID **2510002** remains present. Final preservation/build evidence: `evidence/final-preservation-and-source.json` beside the isolated app. The original and additional model ledgers are separately fixed, hash-chained and capped. [Original evaluation review](NORTH-1A-AI.md) · [all additional 100 outputs reviewed](NORTH-1A-ADDITIONAL.md).

The **216 + 64 + 36 + 18** browser results belong to the reflow snapshot `ed33ac72…`; the final snapshot adds only explicit Clear-menu button wrapping, verified by the two focused cross-engine checks plus the complete final lint/typecheck/unit/build/format runs and four recaptured application journeys. The broad compatibility suite was not silently reclassified as passing after that focused fix. Full logs/commands are retained under `evidence/final-browser-results-reflow.json` and `evidence/final-browser-results-access.json` beside the isolated app.

### Initial failures and corrections

The initial browser run hit a 240-second harness timeout and was gracefully stopped; it is not counted as a passing suite. Saved artifacts show the old assistant screenshot references, a short-hex test parser defect (`#fff` became an invalid RGB expectation) and the real library-question routing defect on Insights. The routing fix preserves implemented native view commands while sending unsupported conversational library tasks to the existing 1A honesty guard. No screenshot tolerance, accessibility rule, authority check or source assertion was relaxed. The new alternative-method test initially failed lint for an unused binding; that binding was removed rather than suppressing lint.

A later complete focused run passed **90** checks and failed the same incorrect price expectation in six profiles: the test expected catalog **$129**, while the application correctly returned the recorded Sample purchase **$149**. The corrected test explicitly requires $149 and rejects $129; all six scoped reruns pass. Reference generation then passed **36/36** checks, deliberately changing 12 fixture references; database-specific references are untouched. The later ordinary comparisons passed separately. One 20-second formatting invocation timed out under browser load; the later completed formatting runs do not erase that failed invocation.

The first full desktop-Light/mobile-Dark fixture run completed **209 passes / seven failures**. Genuine layout regressions involved wrapping North labels at 320px/enlarged text and context text squeezed beside controls, consuming the transcript. A continuity test also expected the old scope text without the newly displayed date. Corrections preserve enlarged font sizes, metadata, 44px controls and the existing clipping/transcript assertions: labels wrap, context controls move to a separate row only when their natural rem-based widths require it, and continuity asserts exact dates/provenance/IDs. A ten-case targeted rerun passed nine; one remaining purchase-page label was corrected afterward. The later passing integrated results and final recapture are recorded above; initial failure evidence remains retained.

That reflow snapshot subsequently passed **18 focused + 216 full + 64 additional-profile + 36 normal visual checks**. Compatibility then completed **100 passes / four WebKit failures**, rather than green cross-engine acceptance. The previously documented `ResizeObserver loop completed with undelivered notifications` remains an actual failure, not filtered or suppressed. Clear-menu explicit wrapping passes its focused cross-engine rerun. The independent access suite and final capture passed; the Sol/recovery suite failed its dedicated-database prerequisite before running any case. These results are reported individually, not hidden behind the compatibility failure or converted into a green overall run.

**Navigation trace diagnosis:** in both 375px/1440px WebKit failures, Documents focus/Enter completed and the target RSC GET returned **HTTP 200** with Documents content, but the client URL remained `/insights` at the original five-second postcondition. No 375px page error was recorded; 1440px had an earlier React hydration #418 before North opened. SDK initialization overlaps the interaction, but neither causality nor a minimal 1A fix is established. These are unresolved actual-browser failures—not automatically attributed to the known ResizeObserver defect, ignored as test noise, or fixed by increasing the timeout. A follow-up diagnostic should instrument click/default prevention, active-element/route-transition progress and SDK teardown before changing shared lifecycle code.

## Incomplete

- Three unresolved WebKit failures, the unexecuted dedicated-database Sol/recovery suite, independent owner acceptance, exact-commit CI and real-device keyboard/IME observations.
- 1B library/date retrieval, totals/trends, formatting-only result reuse, provider-free conversational queries and expanded native analytics are **not implemented by this checkpoint**.
- Existing native presentation planning still belongs to `/insights`. Expanding the assistant preserves its current conversation/context/draft; it does not create a second Studio or turn Home into a native analytics workspace.
- Genuine provider-adapter fixture evaluation does not prove end-to-end browser behavior or native SDK execution. Browser emulation is not real-device testing; coding-agent semantic review is not independent human research.
- No dedicated PostgreSQL suite was run in this fixture-only, network-disabled verification copy. No database/schema or financial acceptance is inferred.

## Blocked

Private-preview refresh and 1B require the owner’s separate 1A review approval. Public licensing/deployment, actual financial operations and paid API activation retain their separate gates. Remaining standing allowance is not authorization for extra calls beyond the fixed completed evaluation batches.

Complete cross-engine acceptance is blocked by the three retained failures. Recovery/expiry acceptance also needs an explicitly dedicated test database reachable inside an approved isolated verification environment; no application credential, network relaxation, database provisioning or migration is inferred from this report.

## Next

Owner reviews the screenshots/interaction foundation and requests revisions or gives a scoped review decision. Before claiming complete 1A acceptance, resolve/verify the three WebKit failures and run the blocked suite against an approved dedicated test database. Keep the working preview unchanged and 1B on hold; neither a visual review nor these partial results silently waives the acceptance gates.
