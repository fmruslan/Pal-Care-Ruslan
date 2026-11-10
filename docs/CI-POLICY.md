# Risk-based CI and private release policy

## Owner decision

Small wording/color/spacing changes must not automatically pay the full ~20–25-minute suite cost. The owner approved automatic conservative risk lanes and explicitly selected **Require gate + PRs**. This supersedes earlier instructions requiring the same three full jobs after every cosmetic change, not security/financial authority or rollback requirements. [STATUS](STATUS.md) distinguishes implementation, actual GitHub protection, observed lane runs and deployment.

## Lanes

The CI-only provisioning candidate selects the GitHub-hosted Ubuntu 24.04 runner's existing official HTTPS Ubuntu fallbacks rather than its intermittently slow Azure archive entry. `scripts/ci-ubuntu-mirrors.mjs` preserves suites/components/signing configuration, rejects unknown inputs and cannot run outside explicit hosted CI. The existing browser/engine and test commands are unchanged. Dependency installation has a provisional **ten-minute** step bound inside the unchanged job budgets; timeouts/errors remain fatal, never a skipped-success gate. This is a full-risk infrastructure change; local transform tests do not prove runner compatibility or faster installation. [Actual failures, evidence and acceptance](STATUS.md).

| Lane | Automatic scope | Required evidence |
| --- | --- | --- |
| **fast** | Modified ordinary Markdown; approved existing UI snapshots; AST-proven text/static-class-only edits in the small allowlisted Care presenters; named display-copy values in `consumer.ts`; safe existing color/spacing/type/size CSS declarations with unchanged selectors/rules | Repository/format/lint/type checks, all unit tests (including classifier/gate regressions), production build, desktop-light/mobile-dark focused Care/Studio/provenance/keyboard/200%-text/Axe and appearance/visual checks. No database/provider operations. |
| **feature** | Recognized Care presentation/domain/calendar and native Studio/customer presentation modules; North UI; related focused tests. Any structural/executable change in an allowlisted cosmetic file promotes here. | Lint/format/types/units/build, explicit dedicated PostgreSQL integrations, four-profile Care/Studio/provenance, focused customer Care/North/native Insights/design, saved-DB → native calendar → injected North/History and injected Sol/actual Studio tools. |
| **full** | Payments, checkout, database/migrations/roles, security/authentication, provider/model transport or AI accounting, API routes, dependency/runtime/configuration, workers, CI/classifier/release/workspace policy; unknown paths; additions/deletions/type changes/renames; missing/non-ancestor history | Existing complete fixture and database foundations plus native acceptance, including financial synthetic/protocol, access/isolation/accounting, cross-engine and full browser/accessibility coverage. No previous full coverage is removed. |

The implementation allowlists in `scripts/ci-risk.mjs` are intentionally narrower than broad folder labels. Unknown or unproven “cosmetic” work promotes upward; changing a `.tsx` filename or saying “just CSS” is insufficient. CSS visibility/display changes, selectors/new rules, remote resources/directives and dynamic/executable JSX changes cannot qualify as fast. Critical source content/hashes are not treated as display copy. Per-event provenance/payment/refund assertions remain checked in the fast lane.

### Classification cannot be downgraded by mixing changes

- Compare the **entire PR base-to-head or push before-to-head range**, not only its last commit or the first matching path. The highest risk wins, regardless of order or volume of cosmetic changes.
- Use the **base revision's classifier**, not a classifier changed in the candidate. Missing trusted classifier/history bootstraps full. Workflow/classifier changes themselves require full verification.
- Parse TS/TSX with the installed pinned TypeScript AST. Only explicitly allowed text/class leaves may differ; operators, identifiers, conditions, bindings, templates' executable expressions, event handlers, links and imports stay exact. Changed suppression comments do not qualify as cosmetic.
- Record head/base SHA, selected lane and reasons in the workflow summary and `risk-classification` artifact. No PR-label, commit-message, environment or dispatch input can request a cheaper lane. `workflow_dispatch` and `submission-*` tags always select full.
- Classification failure, unknown lane, missing job, cancellation, timeout or skipped selected job is **not success**. The `always()` **release-gate** fails closed. Unselected lanes legitimately skip; the gate requires their exact expected state.

This is regression-risk selection, not a new authorization/security boundary against an administrator changing repository policy. Provider/financial/DB permissions remain separately enforced. GitHub administrative control can change protection settings; do not describe CI as preventing an authorized repository administrator from changing CI itself.

## Required GitHub check and PR workflow

`main` had **no branch protection/ruleset** at discovery. Do not claim existing protections were preserved when none existed. Roll out the stable GitHub Actions **`release-gate`** check, then require it on `main`, with up-to-date branches, PR delivery, administrator enforcement, no force pushes/deletion and resolved conversations. No additional human approver is invented for the solo-owner repository. Do not weaken/remove unrelated existing protections if the actual settings change during rollout.

Use the authoritative primary folder, branch `palcare/<topic>`, normal push and PR; no new worktree is required. `main` is the deployment branch, not the ordinary edit branch. `scripts/workspace.mjs` permits that narrow branch convention while retaining root/remote/historical-worktree guards. Private startup still requires **clean primary main / exact build / exact source hash**. Never bypass protection with an admin merge/direct push or rotate branch names to hide failed checks. A newer change still receives checks for its own SHA.

## Exact-commit private promotion

Standard flow: **implement → focused local checks → risk-selected PR CI → merge → exact-release verification → private deployment**.

After merge, the **actual main SHA** receives its own run and required `release-gate`. The existing verifier reuses PR coverage only when the **whole Git tree** matches (including tests, workflow and lockfile), merged PR/head/base/main identities agree, and the latest same-head PR run, classification artifact, every selected job and GitHub Actions' own required check succeed. A different SHA is expected for a squash merge; a different tree is not acceptable. Missing, stale, failed, expired, ambiguous or mismatched proof falls back to normal risk-selected checks. Evidence changing after selection fails promotion rather than silently passing.

With valid proof, main runs **`exact-release`**: revalidate original PR evidence, build exact main source and run GET-only desktop-light/mobile-dark Care → purchases → unchanged original document → native Insights smoke. It does not repeat the full PR suites. The host verifier independently rechecks the remote proof before writing the exact-main deployment receipt:

```sh
node scripts/verify-ci-release.mjs RUN_ID EXACT_MAIN_SHA
```

The verifier requires clean built `main`, exact repository/workflow/event identity, a completed successful run, its classification and `classify`/`release-gate`, plus either all risk-selected jobs or `exact-release` and revalidated identical-tree PR proof. Ignored `.next/palcare-ci.json` records the exact main run and, for reuse, the original tested run/commit/tree. Startup still requires matching commit/source hash/build ID. Restart reuses this local continuity receipt without network/provider calls; it is not a signature or new authority. Missing/expired remote artifacts stop new promotion. Reruns retain original non-rerun passes and require the latest selected job results. Preserve immutable rollback, restricted-role readiness and read-only record/credential/expiry/accounting fingerprints. Promote only application assets, retain automatic application-only rollback and actual desktop/mobile × Light/Dark **private 8444 → 3002** HTTPS checks. No new public/provider/financial/database authority follows.

Prefer one necessary local verification pass and one required PR/main release sequence. Do not start a second full-CI cycle solely to record a successful visual release in Markdown. Record immutable pre-release checkpoints, then the actual run/SHA/build/promotion receipt and final handoff. Never mark a pending gate passed in advance.

## Parallel coverage and local preflight

Full CI partitions each complete fixture/database Chromium matrix into two Playwright shards; `journeys` and `compatibility` independently retain all native and Firefox/WebKit scenarios. All six runners are required. Deterministic lint/format/type/unit/offline checks run once on fixture shard 1. Both database shards and native journeys retain isolated integration setup; readiness failure and Guardian checks each run once. No browser scenario, assertion, retry policy or deadline is removed. Browser caches are keyed by OS/browser set/pinned lockfile; installation still verifies binaries and system dependencies on cache hits.

Before visual/copy PRs, run `pnpm verify:ui` (types, build, focused desktop-light/mobile-dark reflow at 320px, enlarged text, accessibility, appearance and existing visual references). With a current source-matching build, use `pnpm test:ui`. Preserve the working preview before rebuilding its assets, as described in [WORKSPACE](WORKSPACE.md). Add affected domain/integration/native checks for behavioral changes; CI still makes the conservative lane decision. This preflight does not replace exact-commit CI.

The existing strict required **`release-gate`**, GitHub Actions app identity `15368`, PR requirement and administrator enforcement remain unchanged. The protection rollout described above is historical; this optimization does not alter it.

## Final hackathon submission

Regardless of recent cosmetic/feature checks, dispatch **Repository checks** on the final main SHA with no lane downgrade input, wait for all full jobs and gate, then verify:

```sh
node scripts/verify-ci-release.mjs RUN_ID EXACT_MAIN_SHA --final
```

`--final` requires a full, manually dispatched, exact-main successful run. Retain final private HTTPS/rollback/preservation and honest provider/human/real-device/license/public-access limitations. The conservative cutoff remains **November 12, 2026, 12:00 PM PST** and judge access through **December 15, 2026**; neither date waives a gate or grants financial/provider/license authority.

## Timing and acceptance

Fast/feature lanes are intended to reduce unnecessary work; no speedup is claimed until actual exact-SHA runs and elapsed times exist. Record cold browser-install/runner delays separately from test execution. Full infrastructure-policy rollout is deliberately not a fast-lane benchmark. Classifier fixtures verify mixed-risk, executable/template/link changes, critical files, additions/renames, unavailable bases and final-release escalation; gate/verifier fixtures reject skipped/cancelled/wrong-SHA/wrong-workflow evidence. Actual fast/feature/full GitHub observations remain explicit in STATUS.
