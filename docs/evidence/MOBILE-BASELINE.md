# Mobile recovery and ongoing development baseline

Observed on **2026-10-29**. This is a private owner-testing baseline, not submission
readiness or a feature freeze. Customer gates C/D are the selected slice; owner
feedback and the separate public/provider/licensing gates remain open.

## Implemented

- Home's activity/resources grid now has explicit shrinkable tracks and
  `min-w-0` children. Its long source digests wrap within the screen. No global
  horizontal-overflow mask was added and desktop column proportions are retained.
- The navigation test chooses the known 1024px breakpoint and waits for that
  navigation. It no longer takes a one-time visibility snapshot before the
  server-streamed shell arrives. Assertions and CI retry policy are unchanged.
- `customer-reflow.spec.ts` exercises 320/375/390/430/834/1440px, long
  saved-source-shaped text, all four main destinations, actual control hit
  testing, keyboard activation/focus return, CareOS draft entry and axe. Its
  browser-only text injection never creates synthetic payment evidence in a DB.
  Width checks compare against the configured screen as well as layout/visual
  viewport values, catching mobile viewport expansion that `scrollWidth <=
  innerWidth` alone misses. The test is included in Chromium and focused
  Firefox/WebKit configurations.
- `pnpm workspace:check`, standard command guards, private/test startup checks
  and ignored build provenance establish a repeatable primary-checkout workflow.
  [Exact behavior and limitations](../WORKSPACE.md#enforced-startup-and-build-checks).
  The stale current port-3000 owner-preview instruction is corrected; explicitly
  historical paths remain history. The original local design plan is now ignored.

## Original failure and retained diagnostics

At starting SHA `54ec657e181f51891bdb66e49b6fb4223dbea357`, actual Home on a
390px iPhone profile expanded to **510px**, moving bottom navigation/CareOS outside
the visual viewport. The activity section and adjacent Card retained automatic
intrinsic minimum widths despite descendant source text using `break-words`.
A disposable-browser child `min-width:0` probe restored **390px** and clickability.
The same profile's Insights route was already 390px. The root cause was local to
the Home grid, not a failed payment or a permission problem.

Private original evidence is retained under
`/tmp/opencode/palcare-starting-audit-20261029T063000Z/`: `REPORT.md`,
`mobile-diagnostic.json`, `mobile-overflow.json`, `mobile-css-probe.json`,
`established-iphone13-dashboard.png`, and the original failed browser results.
That actual-site audit was **6 passed / 2 failed** and remains recorded as failed.

Old exact-SHA CI [40827830053](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/40827830053)
passed overall but its database-browser stage was **473 passed + 1 flaky**.
The tablet-dark navigation trace selected hidden desktop navigation before mobile
navigation rendered; retry passed. This test race was distinct from actual Home
overflow. The original trace and failure context are retained privately.

## Verification ledger

Current evidence directory:
`/tmp/opencode/palcare-baseline-20261029T070318Z/` (private, outside Git).
The prior complete build is preserved there as `preview-build-before/`.

### Isolated local verification

Complete sequential run **07:22–08:07 UTC**, no retries/skips/failures:

| Check | Result |
| --- | --- |
| Frozen install, repository/diff, lint, format, typecheck, production build | Pass |
| Unit | **716/716**, 45 files |
| Deterministic / offline review | **70/70 + 14/14**, no inference |
| Dedicated PostgreSQL integration | **113/113**, separate loopback test container on 55440 |
| Failure / owner access | **2/2 + 18/18** |
| Fixture / dedicated-database browser and accessibility | **510/510 + 510/510**, zero retries |
| Exclusive synthetic Guardian | **6/6** |
| Firefox / WebKit essential journeys and reflow | **62/62**, emulation |
| Injected Sol protocol / actual SDK | **6/6**, no live requests |
| Production dependency audit | **0 known vulnerabilities**, 211 dependency records; 37 direct packages consistent, lockfile unchanged |

Exact delivered-commit CI, refreshed-preview checks and judge walkthrough results
remain separate pending gates. No old green commit substitutes for them.

Retained execution issues:

1. The first focused run passed 19 checks before its outer tool's 120-second
   timeout interrupted it. No assertion failed; this is not a completed suite.
2. An expanded formatting glob exposed an existing out-of-scope unformatted
   helper. The check was corrected to add only the new workspace module, retaining
   its prior scope. Original failure: `initial-format.log`.
3. The interrupted focused run left a fixture server on port 3100. The new guard
   rejected type generation before shared-build mutation. Its identified wrapper
   was shut down with SIGTERM; `orphan-server-guard.log` is retained. The guard also
   rejected type generation while the original owner preview was serving.

## Incomplete / Blocked / Next

Owner/real-Mac and physical-device observations, fresh provider/token-refresh
acceptance, public isolation/hosting/licensing and separately approved financial,
Channel3/API/0016/webhook work remain distinct. This audit makes no model or PayPal
call and does not renew/reset the existing authorization. Next: finish the
integrated verification and actual-preview walkthrough, then obtain owner UX
feedback before prioritizing the next customer improvement.
