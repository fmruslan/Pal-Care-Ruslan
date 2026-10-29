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
- The owner-approved follow-up corrects customer Studio's `minWidth: 0`.
  The SDK divides widget minimum width by canvas minimum width/columns when
  processing pointer input; zero produced infinite spans and rejected changes.
  Studio now uses measured available width, subtracts SDK wrapper padding and
  clamps custom-widget minimums. Pointer regressions shrink then move into vacant
  space, read back exact saved positions after reload/restore, preserve filters,
  and cover normal widths plus 320px/200% text. Actual preview and integrated
  acceptance are recorded separately below.
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

The approved Studio follow-up separately passes lint/format/typecheck/build,
**716 units, 84 affected fixture + 84 dedicated-database browsers, 28 focused
Firefox/WebKit and 6 injected-Sol checks**, with zero retries. These are affected
reruns, not additions to the earlier full-suite counts. Final exact-commit CI
must independently cover the complete expanded suite; its SHA/run/result are
recorded in the delivery handoff and private `final-ci-*` evidence, not inferred
from an older green run.

### Actual application verification

At code commit `8c36b879be0d84a3d6ee38ab2f2cc5a61646089e`, the bounded preview
uses the primary folder, original restricted connections and original expiry.
Readiness returns **200**, database/subscription mode, with checkout/Guardian off
and discovery fixture. Financial/external-provider flags remain false; no
administrator or paid-provider credential is injected into the web process.

The refreshed audit passed **23/24** checks, including desktop/mobile pointer
resize/move and exact saved-layout restoration after reload with filters intact.
The remaining failure was an audit-only heading wait while the mobile modal made
the background page inaccessible. The corrected fresh-visitor checks pass **2/2**.
Separate native-chart pointer checks pass **2/2**, reading back exact Audio IDs
across grid/KPI/evidence and clearing back to all five purchases. No request to a
model, payment provider or authorized conversation/planner write was dispatched.

Actual responsive checks cover **320/375/390/430/834/1440px**, the four primary
destinations and secondary purchase/care/Guardian/safety/discovery/shop/landing
routes. Navigation hit tests, CareOS composer/focus return, theme/reduced motion,
320px/enlarged text, axe, source links, original receipt, missing records and
disabled checkout pass. Fresh anonymous CareOS receives a genuine **403 before
store creation**. Original Customer/Studio scope checks remain valid.

The disposable-browser negative control is **390px fixed / 510px original grid
rules**, including source-shaped long-text stress; no database row changed.
The final documentation-only delivery build is checked again at startup and in
the actual-preview suite; exact SHA/build ID/results live in the private delivery
report. [Screenshot-backed findings and future judge access](JUDGE-EXPERIENCE.md).

### Preservation and operational boundaries

Read-only application inspection matches **all 30 table fingerprints**, including
the migration journal, against the pre-task snapshot. Original 0000–0015 hashes
match; 0016 remains unapplied. Five Twins remain (four samples, one genuine
completed $129 Sandbox purchase with exactly one receipt/policy/purchase event).
The separate pending eCheck has no Twin; refund rows/completed cases remain zero.
Restricted reader/CareOS catalog/role checks also pass; the broader all-table
comparison used an existing local read-only maintenance connection that never
entered the web environment.

At **17:15 UTC**, 28 protected files, eight historical worktrees, 97
verification-copy files and 18 historical conversation mappings match. Journal
usage remains **33/50: 30 completed, 1 failed, 2 unknown**, with the original
**2026-10-29T22:10:58.310Z** deadline. The two unknowns remain reserved. No live
inference, provider/payment request, credential issuance, application migration,
authorization renewal or public exposure occurs in this task.

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
4. The initial refreshed-preview audit at `d535707` was **22 passed / 2 failed**:
   all Home/reflow and fresh-visitor checks passed, but both pointer probes exposed
   the Studio defect above. `actual-initial-results.json`,
   `actual-initial-failures/` and `widget-diagnostic.json` retain this failure.
   The first width correction missed wrapper padding. Subsequent mobile probe
   failures diagnosed fixed navigation covering an edge and 44px coarse-pointer
   resize handles covering the title. The final probe centers its target and
   drags the widget body; assertions still require actual saved-state changes.
5. The post-fix **23/24** audit and modal-heading wait failure are retained in
   `actual-controls-initial-results.json` and `actual-controls-initial-artifacts/`.
   The corrected wait targets the visible modal, without changing product code.
6. The first direct chart probe targeted the paint-only canvas; the SDK's
   series-area overlay intercepted it, and the outer command timed out. No
   application failure was inferred. Hit testing identified the actual native
   interaction surface; corrected desktop/mobile pointer checks both pass.
   `native-chart-canvas-target-initial-artifacts/` retains that diagnostic.

## Owner testing handoff

Use the existing Mac browser profile and exact **`http://127.0.0.1:3002`** origin.
The private tunnel is:

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:3002:127.0.0.1:3002 bigrus@greatbison.tail9e8802.ts.net
```

Start with `/dashboard`, then `/vault`, `/insights` and `/documents`.
`/ai-evaluation` reports existing owner scopes; switching browser/profile/origin
does not transfer them. Keep existing credentials and pairing history. The
[short review path and ranked UX findings](JUDGE-EXPERIENCE.md) identify useful
manual checks without an inference or payment request. The service stops at the
original deadline above; this handoff does not extend it or enable boot restart.

## Incomplete / Blocked / Next

Owner/real-Mac and physical-device observations, fresh provider/token-refresh
acceptance, public isolation/hosting/licensing and separately approved financial,
Channel3/API/0016/webhook work remain distinct. This audit makes no model or PayPal
call and does not renew/reset the existing authorization. Next: confirm the
delivered-SHA CI/private runtime handoff, then obtain owner UX feedback on gates
C/D before prioritizing the next customer improvement. Public readiness gate E
still needs the separate hosting/licence/model-mode decisions described in the
judge review; no engineering date or new financial authority is invented.
