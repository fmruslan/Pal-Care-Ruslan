# Insights screenshot references by data mode

## Implemented

Test-only correction for customer gate D; no application UI, source labels, provider, authentication or financial behavior changes.

The exact failing tests in [CI 41001520595](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41001520595), commit `2e567b1`, were `tests/e2e/design.spec.ts:256` → `visual regression: insights`, projects **mobile-light** and **mobile-dark**. `.github/workflows/repository-checks.yml` runs the suite once with default `E2E_DATA_SOURCE=fixtures`, then again with `E2E_DATA_SOURCE=database`. Both previously resolved `insights.png` through the same `{projectName}` snapshot path. The global CI `DEMO_DATA_SOURCE=database` does not change the first run: Playwright explicitly supplies the selected test data source to its isolated web server. Both modes use `CAREOS_PROVIDER=fixture` (no live model), independently of purchase data mode.

`CustomerWorkspace` correctly renders **“bundled sample preview”** for fixtures and **“newest 100 saved purchase window”** for database records. CI compared the database wording with a fixture reference. On mobile the changed text exceeded the existing pixel tolerance; passing larger viewports did not mean their references were mode-correct.

Fix in `tests/e2e/design.spec.ts`:

- Keep fixture `insights.png` references byte-for-byte unchanged.
- Select `insights-database.png` only for database-mode Insights, with six reviewed new references (desktop/tablet/mobile × Light/Dark). Other page references remain unchanged.
- Assert the actual mode-specific purchase-window/provenance text before screenshot comparison, alongside the existing heading, font readiness, appearance-control and actual Studio canvas checks.
- Put full-page diagnostic artifacts under their data-mode directory to avoid fixture/database overwrites.
- Preserve `maxDiffPixelRatio: 0.005`, animations/caret settings, all tests and meaningful assertions. No masking, source-text substitution, fixture fallback or snapshot-threshold changes.

## Verified

Isolated source/build/test services ran in a verification container, separate from the active preview's filesystem/process and sharing only the existing **dedicated acceptance PostgreSQL** network namespace. No production `.env`, owner/provider credential directories or private preview `.next` were mounted for writes. The primary source was copied to a protected verification directory; generated assets and browser output stayed there. Original repository metadata was read-only. Dependencies were initially read-only; Vite's temporary-config write failed before units could start, so dependencies were copied into the isolated directory and units/build rerun successfully. No repository fix/guard bypass was needed for this harness constraint. No branch/worktree was created, workspace guards were not weakened, and no application migration was run. The test service used disposable restricted runtime roles in the explicit `_test` database, never application PostgreSQL port 55432.

The unchanged failing test was first rerun in database mode: **both original failures reproduced**, with the same **1,800/1,946** differing pixels as CI. The reviewed mobile diffs isolate the correct provenance line. Corrected references were generated only for database Insights; subsequent normal comparisons (without snapshot updating) passed **72/72 database + 72/72 fixture design tests**, all six viewport/theme projects and all five visual pages. Isolated lint, format, typecheck, **794 units** and production build pass. Exact final commit CI is reported in the handoff after execution.

Read-only preservation checks passed: **30 protected files unchanged**, same private preview PID **1723693**, unchanged active build metadata, unchanged Tailscale Serve configuration; original **17 source tables / three CareOS rows / 0015 29-table schema** preservation passed. No application `.next` was rebuilt and no owner/provider/financial operation was dispatched. Any later ordinary owner AI usage remains independently accounted; no test borrows that authority.

Evidence is retained outside Git in `/tmp/opencode/palcare-insights-visual-20261030/`, including original failed traces/diffs, isolated verification log, protected-file fingerprints and preview provenance. This is visual/test configuration acceptance, not new AI/provider acceptance or browser-authentication investigation.

## Incomplete / blocked / next

Exact-commit GitHub CI must pass before the CI gate is called complete, including Guardian, Firefox/WebKit and injected-Sol stages skipped after the former screenshot failure. No skipped/previous-commit result substitutes for that run. The active private preview intentionally stays on its already-running application build: this test/docs-only change needs no service restart. Refreshing its build provenance at a future routine restart remains a separate coordinated operation, not an excuse to interrupt the working owner session now.
