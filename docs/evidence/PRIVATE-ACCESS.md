# Private browser access: focused usability/security verification

Date: 2026-10-28. Scope: recognize existing Customer/Studio cookies and add explicitly SSH-authorized, browser-bound owner bootstrap. No new account system, longer-lived cookie, model allowance or deployment.

## Cause, before changing code

- The existing unlock already sets a **persistent** cookie with `Expires` at the approved window deadline, `HttpOnly`, `SameSite=Strict`, host-only path `/`, and `Secure` on HTTPS. It is not an SSH-session or process-session cookie.
- The approved launcher reuses protected `application.json` scope tokens. The earlier owner-approved renewal preserved those values and all credentials; it changed expiry only. Restart/reconnect with unchanged configuration does not invalidate an unexpired cookie.
- The prior window expired at **2026-10-28T16:42:26.459Z**, before the GreatBison reboot at about **21:53 UTC**. The database had been cleanly stopped earlier; the preview had no boot-start service. A reboot explains connection refusal, not cookie rotation. A browser can already have deleted the expired cookie by the time legitimate renewal occurs.
- The original access page always rendered the token form, without checking existing scope cookies. That unnecessary prompt was a real UI defect.
- The first status-only fix did **not** solve owner onboarding: after cookies were missing/invalid, its only authorization path was still manual transfer of the raw application scope token. The owner's Chrome screenshot after renewal confirmed this remaining functional gap. A valid server approval does not itself issue cookies in a remote browser, and the server cannot identify the Mac owner merely from localhost/SSH forwarding.
- The Mac cookie store/profile cannot be inspected here. Native expiry is consistent with the observed timeline, not proof of the exact deletion mechanism on the Mac. Private browsing, site-data clearing or switching hostname/profile could also remove/hide cookies. Separate conversation cookies/history expiry are not the same as evaluation-scope authorization.

## Implemented

The server-rendered access page recognizes each scope independently, displays exact server expiry and workspace links, and hides the selected scope's token form when authorized. A GET-only status route supports **Check access**, focus/visibility and deadline rechecks. Unavailable connections/configuration and expired windows have distinct guidance. Status responses contain no token, token hash or provider credential, set no cookie, and cannot create a conversation, renew approval or invoke inference. Existing POST authorization, absolute cookie lifetimes and protected endpoint checks are unchanged.

### Owner bootstrap, not localhost auto-login

Normal use now offers **Connect selected scopes via SSH** rather than raw-token entry. A random public request ID is bound to a separate 256-bit HttpOnly/Strict browser secret, with only its hash stored. The owner explicitly approves that ID and exact requested scopes via a generated SSH command executing `scripts/owner-access.ts` as the existing owner OS account. There is no HTTP approve action. Only the original browser can then **Finish owner connection**, which atomically consumes the grant and issues the existing Customer/Studio cookies at the unchanged approved-window deadline. Neither private scope values nor provider credentials appear in commands, URLs, JSON or the UI. Raw scope-token entry remains an advanced fallback only.

Pending grants expire after at most five minutes, cannot cross the approved-window deadline, and are bound to the original session approval/window/origin/scope hashes. Wrong-browser completion, replay, wrong Origin, extra HTTP approval fields and scope widening deny. A protected `owner-access.json` uses its own lock and caps issuance at 32/window, 12/hour and one per five seconds. Original session/application/registration/journal files are read, not rewritten. The request cap can be exhausted by someone with local network access; it bounds resource use rather than promising denial-of-service immunity. Stale locks require owner inspection; the app never steals locks or resets inference quota to recover.

**Threat model and consent:** owner authority comes from executing the approval CLI under the existing SSH/OS account plus explicit scope consent, not from the mere presence of a tunnel. The public ID alone is not a bearer credential. An owner must approve only the request displayed in their own browser; phishing approval of another person's request, compromise of the owner/root/SSH account, and untrusted same-host services remain risks. This is a small owner-only bootstrap, not independently verified human identity, multi-user production authentication, a permanent bypass or a new public service. A dropped completion response may require a new pairing; consumed grants cannot replay.

The window remains **2026-10-29T22:10:58.310Z**; usage remains **28/50**, **22 slots remaining**, including **two retained unknown outcomes**. No renewal, token rotation, provider dispatch, financial action, fallback, migration, reset or public deployment is part of this change.

## Access boundaries observed on GreatBison

| Boundary | Verified locally | Limit of the evidence |
| --- | --- | --- |
| Application listener | Next.js listens only on IPv4 `127.0.0.1:3002`, not `0.0.0.0`, a LAN/Tailscale IP or IPv6 wildcard. Readiness reports database/subscription, checkout/Guardian disabled. | Not an independent external penetration test or guarantee against another host process forwarding traffic. |
| Tailscale | Daemon running; built-in Tailscale SSH enabled. Current Serve/Funnel status shows tailnet-only mappings to other ports, **none to 3002**; no public Funnel for this preview. Conventional `ssh.service` inactive; no ordinary port-22 listener was listed. | Full tailnet ACL/SSH grants, device identity/compromise, Mac firewall/profile and existing Mac forward binding cannot be established here. The two known peers are not evidence that only the owner can connect. Other tailnet-exposed development tools may confer indirect host access; their authorization was not audited. |
| Browser authority | Separate 256-bit Customer/Studio capabilities; host-only persistent HttpOnly/Strict cookies; Secure on HTTPS. Exact Origin on unlock/mutations; protected cross-scope endpoints deny. Ordinary fictional read-only pages remain browsable without a scope. | HTTP on Mac loopback does not use a Secure cookie; SSH encrypts the host-to-host transport. Loopback cookies are **not port-isolated**; other local services/processes on the same host/profile are not an untrusted isolation boundary. |
| Files/host | Protected directory `0700`, application/session/registration/runtime files `0600`, owned by `bigrus`; inspected ACLs have no extra user/group entries. App runs under that same account. | `bigrus` belongs to sudo/docker groups. Same-user processes, root and container administrators can access/bypass host secrets. Existing OS-isolation blocker remains; this is not suitable for public exposure. |
| Service lifetime | Private transient user service uses the approved launcher and survives SSH/OpenCode exit; runtime is bounded by remaining approved window. | It is not a boot-persistent service. After reboot, the owner must restore the preview under a still-valid/legitimately renewed window. Browser cookies alone cannot start a server. |

## Verification

- **Implemented:** scope status/GET, explicit browser-bound request/complete API, host-only approval CLI and owner-first setup UI; original persistent scope cookies and protected endpoint checks remain intact. The approved private launcher enables the bootstrap explicitly; it defaults off elsewhere.
- **Isolated tests:** initial status-only checkpoint passed 410 units and 12 browser checks but was **not** sufficient owner-onboarding acceptance. The final owner-bootstrap tree passes **422/422 units**, **18/18** final access checks (six scenarios × Chromium/Firefox/WebKit) and **7/7** focused fixture CareOS/Studio continuity checks. Build, typecheck, lint, formatting and repository/diff checks pass. Access tests use a real isolated production server and real CLI with synthetic protected home files, fixture data and no provider/database credentials. Coverage includes browser binding, no HTTP approval, exact requested scopes, changed-window invalidation, concurrency/single-use consumption, persistent caps, file permissions, expiry, retained/removed cookies, reload, offline reconnect, process restart and saved browser state. These Linux engines are not real-Mac certification. Traces are off. Initial harness errors (Expires clock skew, Next alert selection, advanced fallback re-closing after offline remount, TS test environment typing/CLI startup timeout under build contention) were corrected without relaxing authorization checks.
- **Actual application verified:** a **fresh** browser on actual port 3002 requested both scopes; completion remained pending until the real owner host CLI approved it. No scope token was pasted/submitted to the old unlock endpoint. A different browser could not claim the approved ID; replay was rejected. Granted cookies survived refresh, browser reopening and an actual private-service restart, with values/deadlines unchanged. Anonymous status denied both scopes. Customer-only cookie rejected by Studio endpoint; Studio-only cookie rejected by Customer endpoint (HTTP 403 before conversation creation). No questions/planning/start actions with valid scope were dispatched. Pending and connected screenshots inspected privately without secrets in the DOM. This verifies host CLI approval, **not** an SSH command executed from the Mac or authorization of that Mac's Chrome profile.
- **Preservation:** protected application/session/registration/preservation files and restricted runtime configuration remain byte-for-byte unchanged. Read-only preservation check passes for 17 original readable source tables, three original CareOS rows and unchanged **0015 / 29-table** schema. No claim about additional unreadable tables is inferred. Credential/bundle verification passes.
- **Externally unverified:** actual Mac browser-cookie settings, real SSH/Tailscale disconnect/reconnect from the Mac, tailnet policy completeness and independent external reachability. Saved-state/offline/browser-engine tests do not certify these.

Run the isolated access suite after building:

```bash
pnpm exec playwright test --config=playwright.access.config.ts
```

It is also included in CI. No PostgreSQL integration/migration suite was run for this slice; no SQL/schema, purchase-domain or provider change exists. Do not point tests at the deployed application database.

Changed files: `src/lib/careos/evaluation-access.ts`, `src/lib/careos/owner-access.ts`, `src/lib/careos/subscription/files.ts`, `src/app/api/ai/evaluation/route.ts`, `src/app/api/ai/owner-access/route.ts`, `src/app/ai-evaluation/page.tsx`, `src/components/careos/evaluation-access.tsx`, `src/components/careos/owner-connection.tsx`, `scripts/owner-access.ts`, `scripts/subscription-private-app.ts`, `tests/unit/evaluation-access.test.ts`, `tests/unit/owner-access.test.ts`, `tests/access/evaluation.spec.ts`, `playwright.access.config.ts`, `.github/workflows/repository-checks.yml`, `README.md`, `docs/API.md`, `docs/SECURITY.md`, `docs/STATUS.md`, `docs/SUBSCRIPTION-DEVELOPMENT.md` and this ledger. Exact local commit is reported at delivery; a newly successful remote CI run is not inferred from local tests.

## Mac access

1. Keep Tailscale connected and use your existing working SSH tunnel to GreatBison. Bind the Mac end to loopback, not all interfaces. If that tunnel is still open, do not start a competing forward on the same local port.
2. In the **same normal browser profile**, bookmark **http://127.0.0.1:3002/ai-evaluation**. Do not switch to `localhost`, a Tailscale HTTPS URL, a different profile or private browsing.
3. Authorized scopes show **Authorized in this browser**, their deadline and workspace links. Use **Open Customer CareOS** (`/dashboard`) or **Open AG Studio** (`/merchant/intelligence`); no further token is needed during the window while its cookie remains valid.
4. If a scope is missing, choose the needed Customer/Studio scopes and **Connect selected scopes via SSH**. Use **Copy SSH approval command**, run that generated command in a **new Mac Terminal tab**, then choose **Finish owner connection** in this same Chrome profile within five minutes. The command is specific to your own browser request; do not run an unsolicited approval command. No private token retrieval, transfer or pasting is needed. The existing tunnel stays open.
5. Both selected scopes should now say **Authorized in this browser**. Open the workspace links and test the finished UX. This is the remaining real-Mac acceptance step; the remote agent cannot silently perform it for the Mac profile.
6. If connection fails, reconnect the tunnel first, then refresh/**Check access**. Reconnection is not scope renewal. If the window expired, request legitimate owner renewal, then pair this browser again only if cookies expired/were deleted. Never enter an OAuth/API/ChatGPT credential or paste tokens into chat/URLs. The page does not recreate a deleted cookie merely because the network is trusted or silently extend approval.

Optional replacement for an inactive Mac tunnel (uses the observed GreatBison DNS name and account; retain your existing SSH login if different):

```bash
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:3002:127.0.0.1:3002 bigrus@greatbison.tail9e8802.ts.net
```

Keep that Terminal open. This does not enable Mac Remote Login, public access, boot persistence or automatic window renewal.
