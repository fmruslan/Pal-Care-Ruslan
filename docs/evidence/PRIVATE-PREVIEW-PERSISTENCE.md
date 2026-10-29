# Private preview persistence — 2026-10-29

## Implemented

Owner requested an always-available private development website and self-recovering Mac tunnel, retaining existing data, protected configuration and expired AI authority. This is operational reliability for the customer experience, not a new A–E capability acceptance or public deployment.

- `scripts/private-preview.ts` starts only a clean exact-commit primary `main` build, rechecks actual restricted reader/CareOS database authority and evidence guards, and passes an allowlisted environment to loopback-only Next. No authorization file creation/write, migration, seed, Git update or model/provider call occurs at startup. Missing/corrupt AI records remain denied subscription mode, never fixture substitution.
- `ops/palcare-preview.service`: persistent user service, ten-second restart delay, control-group stop, restrictive umask and no website-wide AI runtime deadline. Existing user linger allows boot startup. PostgreSQL uses `unless-stopped`, without database/container recreation.
- Persistent-preview readiness separates database/website health from the AI window only under the exact private, financially disabled configuration. Original inference scope/session/expiry/budget guards remain unchanged. `aiAuthorization` reports configured evaluation-window state only, not provider authentication/availability. Owner pairing stays disabled; no renewal is implied.
- CareOS shows expired access, suppresses automatic conversation bootstrap and disables new sends after expiry, including already-open tabs and wake/resume event-time checks. Saved pages and locally permitted native Studio remain available; no local-evaluation license is activated or extended.
- `ops/macos/`: one-time launchd installer, foreground built-in SSH with explicit loopback bindings, keepalives, strict host keys, batch mode and no multiplexing/inherited SSH configuration. It refuses unknown listeners/jobs, preserves previous managed files, creates no keys/trust and includes doctor/uninstall tools. Actual Mac installation is separate from preparation.

## Verified

### Diagnosis — actual host observations

At **22:48:30 UTC**, nothing listened on GreatBison port 3002 and readiness was connection refused. Journal evidence: the historical transient `palcare-careos-private.service` was stopped at **22:10:53 UTC**, `Service reached runtime time limit`, `result timeout`. Its deadline followed the original **2026-10-29T22:10:58.310Z** AI approval. The collected unit no longer existed; no persistent Pal Care unit was installed. This establishes the server-side cause, not merely a guessed Mac tunnel failure.

Tailscale was Running, GreatBison Tailscale SSH enabled, and the Mac `ruslans-macbook-air.tail9e8802.ts.net` responded in **76ms**. Mac TCP/22 refused a connection, so remote inspection of its local listener/login jobs was unavailable; this does **not** prove its outgoing tunnel was missing. No server port conflict was observed. GreatBison user linger was already **yes**. Docker was enabled/active, but application PostgreSQL restart policy was **no**. No SSH server/security/Tailscale policy was changed; privileged `sshd -T` inspection required an unavailable sudo password.

### Isolated checks

Initial implementation passed lint/typecheck/production build and **740 units**. New rules cover expired/missing/malformed authority, distinct scopes, retained unknown history, blocked session enforcement, exact private readiness boundaries, no environment-secret fallback and supervisor/tunnel configuration. Initial lint found event-time `Date.now` references inside context handlers; these moved into an explicit event-time helper. Typecheck found a widened NODE_ENV literal; corrected without relaxing checks.

Linux shell syntax and `systemd-analyze --user verify` passed. These do not validate macOS launchd behavior. Focused fixture browser tests passed **58/58**, desktop-light/mobile-dark, including native Insights, assistant interactions, appearance and comparison-only screenshots. Injected-model/protocol/expiry tests passed **10/10** including initial expiry and an already-open tab crossing expiry; no hosted model calls. Explicit dedicated port-55440 database integration passed **113/113**, failure/cleanup **2/2**, zero skips; never application port 55432. Final lint/format/typecheck and **740 units** pass. The new launcher rejected the current dirty/non-final build with exit **2**, before starting Next or changing authority. The initial browser startup encountered **EADDRINUSE on test port 3100**; subsequent inspection showed no remaining listener/Next process. No unrelated process was killed; the serial passing rerun used dedicated test port 3120. This was not a preview-port conflict.

### Preservation / actual activation

At **22:55:59 UTC**: **28 protected files** hashed, **33/50** attempts and **two unknowns** retained, original expiry unchanged and already expired. Complete prior `.next` preserved under `/tmp/opencode/palcare-persistence-20261029/previous-next`; earlier recovery builds remain. Before edits, the read-only **21 readable table/schema fingerprints** matched the prior UI checkpoint, and original preservation checks passed (**17 source tables**, **three original CareOS rows**, **29-table / 0015** schema). Inaccessible table contents are not independently certified.

The reviewed user unit is installed and enabled; runtime activation/recovery is checked after committing/building clean main. `docker update --restart unless-stopped palcare-postgres-1` changed only the restart policy: container ID and **2026-10-28T22:07:46.680383749Z** start timestamp are unchanged. No database restart/recreation or volume operation occurred. Process-crash recovery, final readiness/UI and post-change fingerprints remain pending until observed. An enabled unit/linger/restart policy is boot configuration evidence, not an actual GreatBison reboot test.

The reviewed six-file non-secret Mac bundle is `/tmp/opencode/palcare-persistence-20261029/Pal-Care-Mac-Tunnel-20261029.zip`, SHA-256 `ce0c23433453d2e3f790ecb8fc6b2b20ceb1772fafac3c8985a8350f525abf24`. It includes only `ops/macos/` installer/tunnel/doctor/uninstaller/README files, no protected state or credentials. Delivery does not establish installation.

### Exact-commit CI

Not run/pushed in this local-only task. Local checks and actual application observations are not GitHub Actions evidence.

## Incomplete

Actual Mac launchd installation, unattended SSH success, Chrome through the tunnel, login/reboot and sleep/wake/network reconnection. No remote Mac shell is available. Reboot testing GreatBison would affect unrelated workloads and is not performed silently. No claim of guaranteed uptime while asleep/offline, during intentional safe builds, with invalid builds/database credentials, or after Tailscale/SSH authentication expires.

## Blocked

Mac one-time setup requires owner execution; it cannot be remotely installed merely by delivering a ZIP. Tailscale SSH check mode, device-key expiry, keychain lock and missing host trust may still require owner authentication; no bypass or policy relaxation is authorized. AI remains expired; no inference, allowance reset, credential renewal or paid fallback is included. Public deployment/licensing/provider gates remain separate.

## Next

Finish server crash/restart and preservation acceptance, then have the owner install the Mac bundle once and verify Chrome with Terminal/OpenCode closed, login, sleep/wake and Tailscale reconnect. Further authentication-policy changes require a separate exact owner decision if unattended SSH fails. Continue customer gates A–E only on their own evidence; persistence does not mark those capabilities shipped.
