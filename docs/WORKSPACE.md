# Primary Pal Care workspace

## One authoritative development location

| Item | Use |
| --- | --- |
| GitHub repository | [`fmruslan/Pal-Care-Ruslan`](https://github.com/fmruslan/Pal-Care-Ruslan) |
| Primary branch | `main` |
| Primary folder on GreatBison | `/home/bigrus/projects/palcare` |
| OpenCode project | **Pal Care** — choose the workspace at the primary folder |
| Private preview | `http://127.0.0.1:3002`, served from the primary folder |

Start new work in the primary workspace. Reopening an old conversation intentionally retains its historical directory; project naming does not silently move conversations. Check the displayed path before editing. OpenCode also retains an older, empty project record explicitly labeled **Pal Care — legacy project record**; do not use it for new work.

From a terminal, start OpenCode with an explicit directory:

```bash
cd /home/bigrus/projects/palcare
git status --short --branch
git remote -v
pnpm workspace:check
opencode
```

The repository-local Git settings require fast-forward-only pulls and simple pushes. Do not force-push, reset, clean, automatically stash, switch another worktree's branch or discard unexpected changes. A new task requiring a separate worktree needs explicit owner agreement.

## Private preview operations

The owner-approved persistent preview uses **`palcare-preview.service`**, a user systemd service installed from `ops/palcare-preview.service`, working directory `/home/bigrus/projects/palcare`, running `scripts/private-preview.ts`. It binds only **127.0.0.1:3002**. `Restart=always`, a ten-second delay and the existing enabled user linger recover process exits/startup database races and allow boot startup without OpenCode. The Docker database has `restart: unless-stopped`; no volume recreation/reset is needed. Generic `pnpm start` is not a replacement.

The website has **no AI runtime deadline**. The original session/application records, hashes, expiry, attempts and unknowns remain intact. Expired/missing AI is denied, never renewed and never replaced with scripted answers; saved purchases/documents and locally permitted native analytics remain usable. Private readiness still checks database connectivity, actual roles, evidence guards and required records; its `aiAuthorization` field describes the configured evaluation window, not provider health or permission to infer. Owner pairing is off in this persistent launcher; renewal/pairing requires separate approval. The historical `palcare-careos-private.service` transient AI-bounded launcher is retained but superseded, not edited into a bypass.

The Mac uses the one-time [launchd tunnel installer](../ops/macos/README.md). Keep the same Chrome profile and exact **http://127.0.0.1:3002/dashboard** hostname. Only loopback is exposed on either end. Mac installation/unattended SSH, Tailscale reauthentication and actual sleep/login tests must be verified on the Mac; server readiness alone cannot prove them. [Persistence evidence and limitations](evidence/PRIVATE-PREVIEW-PERSISTENCE.md).

### Routine approved preview refresh

1. Confirm primary `main`, remote, status and `pnpm workspace:check`. Preserve protected-file hashes/read-only data fingerprints and the complete recovery build outside Git.
2. `systemctl --user stop palcare-preview.service` **before** typegen/build/application suites. Do not rebuild serving `.next` files. Do not stop/recreate the database.
3. Make the requested reversible edits and run relevant tests, lint, format, typecheck and build. Commit locally on `main` when authorized. Build again after the final commit: startup requires clean tracked main, exact commit, source hash and build ID.
4. `systemctl --user start palcare-preview.service`. Check `systemctl --user status palcare-preview.service`, `curl --fail http://127.0.0.1:3002/api/ready`, listener/cwd/build provenance, actual UI and preservation. Never adjust AI budgets/deadlines to make startup work.
5. If startup fails, inspect `journalctl --user -u palcare-preview.service -n 60 --no-pager`. No automatic Git pull/build, credential renewal, migration or seed is performed. Dirty/stale code intentionally fails closed until a safe rebuild; persistent uptime does not mean serving unapproved edits.

Installation (owner-approved persistence scope only): install the reviewed unit into `~/.config/systemd/user/`, `systemctl --user daemon-reload`, then `systemctl --user enable --now palcare-preview.service`. Existing linger is required for boot start. Stop/disable this unit to undo supervision; retain configuration/data/recovery builds. Do not enable another concurrent port-3002 service. Reboot configuration is not an actual reboot test; do not reboot GreatBison's other workloads without coordination.

The launcher reads only the existing restricted URLs from protected `.env.local` and the existing protected host authorization files. Never copy secret values into this document, Git, service arguments or OpenCode configuration. Keep migration/admin credentials outside the web environment. No application migration, seed, reset, payment, paid API activation, authorization renewal or live inference is part of consolidation.

**Historical consolidation rule, superseded for website uptime only:** the approved AI window expires at **2026-10-29T22:10:58.310Z**. At consolidation preflight, the existing journal held **33/50** attempts, including **two unknowns**. These observations are not permission to renew/reset/infer. The former transient service stopped on expiry and had no boot persistence. The owner subsequently approved the persistent website above; expired/denied AI still cannot dispatch, while website startup no longer depends on that window.

Before replacing an active build, arrange a bounded stop/build/start and preserve the prior build. Do not run `pnpm build`, type generation or browser suites that mutate the preview's shared build while it is serving. Application database preservation checks are read-only; integration/browser suites use only an explicit, independently verified dedicated `TEST_DATABASE_URL`.

## Enforced startup and build checks

`pnpm workspace:check` reports the actual root, branch, SHA, origin, dirty paths, intended port-3002 source, running Next PIDs and ignored `.next/palcare-build.json` provenance. Run it at the start of every session. It never fixes, stashes, switches or deletes anything. The preserved local design plan is explicitly ignored.

Standard dev/build/typecheck/lint/test commands require the correct repository. On GreatBison they also require the primary root and `main`; CI and isolated deployment checkouts remain portable (including detached HEAD). Dev/build/typecheck and test commands stop if that checkout is serving Next, preventing shared-build replacement. Browser configuration and the test-server launcher also check the workspace. These are accidental-use safeguards, not an OS sandbox; direct underlying binaries and unchanged historical scripts can bypass them. Always check the session path first; retained historical checkouts are not retroactively modified.

Successful `pnpm build` writes build ID, exact commit, source-input SHA-256, directory, runtime and build time under ignored `.next/`. Private startup requires clean tracked `main`, the primary build, matching build ID/input hash and exact current commit. Test startup checks source/build agreement. Missing/stale provenance fails closed: preserve the old build, stop the service, build, then restart the persistent website **without changing any AI deadline**. A documentation-only commit still needs a new exact-commit private build. Generic deployment start is rejected on GreatBison, and normal dev binds loopback. Neither check creates or renews credentials, authorizes a provider call, runs a migration or changes exposure.

## Consolidation evidence — 2026-10-29

### Implemented

- Reconfirmed GitHub `main` at `9605694` and development at `30fcac8`, **0 behind / 13 ahead**, immediately before the fast-forward. Development's exact [CI run 40808500734](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/40808500734) passed every stage. Historical product acceptance limits in [STATUS](STATUS.md) remain unchanged.
- Fast-forwarded the primary `main` checkout without changing the development branch or any historical checkout. Additional workspace documentation is a normal descendant commit, not a rewritten product commit.
- Set only repository-local `pull.ff=only` and `push.default=simple`; existing remotes and branch tracking are retained.
- Updated the existing OpenCode project through its supported V2 project API: same project ID and canonical folder, display name **Pal Care**. Labeled the separate older project record as legacy. No OpenCode database edits, conversation moves/deletions or global server-directory changes.
- Preserved the untracked `docs/DESIGN-REFRESH-PLAN.md`, protected `.env.local` and ignored legacy directories. The verification checkout's 97 changed/untracked files remain where they were; 91 matched the development commit and six were older documentation copies, not missing product code.
- Created protected recovery copies under `/home/bigrus/.local/state/palcare-consolidation/20261029T055626Z`: complete Git bundle, nine-checkout inventories/patches/untracked archives, 18 conversation exports, project/session mappings and protected-state evidence. Previous primary generated artifacts were moved there before reinstall/build, not deleted. These private backups are not deployment files or public evidence.
- Restored the initially offline `palcare-careos-private.service` from the primary folder, bounded by the remaining original window, with no automatic restart or boot enablement. Its prior transient unit was absent and no listener existed; the exact reason for its earlier exit was not established. The previous development-folder build is retained.

### Verified

- Preflight read-only preservation passed for the 17 historical source tables, three original CareOS rows and the original **0015 / 29-table** public schema.
- Separate before/after read-only checks match for **21 accessible tables**, role identities and catalog/schema definitions across the existing reader/CareOS connections. Nine tables, including the migration journal, were not readable through these roles; no broader credentials or grants were requested. No claim of direct row verification for inaccessible tables is made. The first audit probe encountered the expected migration-schema permission boundary; the corrected audit uses catalog OIDs without widening authority.

| Evidence on the consolidated primary checkout | Result / scope |
| --- | --- |
| Frozen install, lint, typecheck, production build, formatting, repository/diff checks | Passed; original runtime/product code unchanged from `30fcac8` |
| Unit suite | **712/712** |
| PostgreSQL integration | **113/113**, explicit `TEST_DATABASE_URL` on separate loopback port 55440; never application port 55432 |
| Focused Insights / source-care / secondary Studio browsers | **16/16 fixtures + 16/16 dedicated database**, desktop-light/mobile-dark; actual SDK with scripted planning, not new inference |
| Owner-access browsers | **18/18**, Chromium/Firefox/WebKit, isolated protected homes and actual host CLI; no private-session renewal |
| Unavailable-database / disposable-role cleanup | **2/2** |
| Deterministic/fixture evaluations and offline review | **70/70 + 14/14**, zero model/financial calls |
| Browser credential/deployment-file scan | Passed, 25 browser artifacts; protected host files not bundled |
| Actual private readiness | **HTTP 200**, database/subscription; checkout/Guardian disabled, discovery fixture |
| Actual customer/Studio interfaces | Five saved purchases; all three Insights views, native grid/chart, CareOS composer and merchant Studio accessible |
| Actual access/primary pairing configuration | Original Customer/Studio cookies accepted; customer-only/foreign-Origin denial; pairing page uses primary folder, no grant issued |
| Actual process | Working directory `/home/bigrus/projects/palcare`, build ID `WoAbbU2vQrsw89yfDhGRV`; original restricted connections/expiry, seven financial/external-provider flags false, additional paid credits disabled, no admin/provider secrets injected |
| State preservation | All **28 protected-file hashes** unchanged, including existing registration/session/application/pairing files and `.env.local`; **33/50**, two unknowns and original expiry retained; verification copy's **97** changed files unchanged |

The initial read-only private smoke assertion failed because opening CareOS normally requests `POST /api/careos/conversations`. The harness blocked that legitimate non-model bootstrap before dispatch, preserving every application row. The corrected smoke requires exactly that one blocked bootstrap and no other write/external attempt; no product code or security assertion was weakened. All remaining UI/GET checks pass, with zero dispatched writes, zero new model/financial requests and no uncaught browser errors. This does not claim a fresh live conversation or real-Mac acceptance. Initial failure evidence is retained privately.

Exact final-main commit/push/CI and final non-destructive consistency results are recorded in the delivery handoff and protected recovery directory. The new documentation commit does not alter the built application; private build provenance records source hashes/build ID, and the final audit checks them again. CI evidence for the development SHA above is not silently reused as a new-main-run result.

### Incomplete / blocked / next

Product owner/real-Mac acceptance, public OS isolation, public licensing/deployment, paid API/0016, Channel3 and financial refund/webhook acceptance remain separate gates. Consolidation does not mark Customer Insights shipped. Preserve all historical locations until the owner separately approves cleanup:

- `/home/bigrus/.local/share/opencode/worktree/ba4124/careos-sol-medium`
- `/home/bigrus/.local/share/opencode/worktree/ba4124/palcare-capture-reconciliation`
- `/home/bigrus/.local/share/opencode/worktree/ba4124/palcare-immediate-payment-test`
- `/home/bigrus/.local/share/opencode/worktree/ba4124/palcare-premium-ui`
- `/home/bigrus/.local/share/opencode/worktree/ba4124/palcare-stage2-completion`
- `/home/bigrus/.local/share/opencode/worktree/ba4124/palcare-stage2-verified`
- `/tmp/opencode/palcare-ci-40785730940`
- `/tmp/opencode/palcare-customer-verify`
