# Private ChatGPT-powered CareOS development

**Current access procedure:** use the Tailscale HTTPS bookmark and [Testing access](TESTING-ACCESS.md), not historical tunnel/token-copy instructions below. The site currently prepares a request only; HTTPS renewal/pairing/live activation remain disabled pending exact owner approval. OAuth access tokens are separate from the testing window. The existing adapter refreshes provider tokens only within authorized server-side use; this request UI never refreshes or reconnects credentials. Preserve GreatBison's sole refresh chain and all prior attempts/unknowns.

**Implemented and actual-application verified on GreatBison, 2026-10-27.** CareOS uses its own official ChatGPT authorization with `gpt-6.1-sol` / medium. The private preview binds to **127.0.0.1:3002**, uses the existing restricted PostgreSQL reader/CareOS logins and original **0015 / 29-table** database. Original port 3000/configuration is not replaced. No PayPal call, paid API fallback, public deployment or application migration.

[Actual product-quality evaluation](evidence/SUBSCRIPTION-QUALITY.md) · [historical failed pilot](evidence/CHATGPT-PILOT.md) · [separately deferred API path](AI-EVALUATION.md)

## What runs

- Receipt, identity, purchase facts, policy/status and navigation stay deterministic where possible. They are labeled **From saved records · no model call**, not passed off as model output.
- Sol interprets ambiguous language, uses recent same-Twin context, selects reviewed exact-model care passages and selects relevant saved evidence. Care instructions render the approved source wording, not unverified model paraphrases. Missing/withdrawn/conflicting sources remain explicit.
- Studio uses the genuine server model planner and actual SDK tools for browser-only filters, a verified-only summary, evidence selection and reset. Recorded and illustrative data remain separate; no financial tool exists.
- PostgreSQL stores bounded conversations/request fingerprints with existing scopes, ownership, expiry, leases and rate limits. The subscription transport has a **separate protected request/token journal**, not API-dollar reservations. Existing paid-API budgets/unknown reservations are untouched.

## Official protocol and reader correction

`src/lib/careos/subscription/` shares the official OAuth/PKCE/OIDC helper, private storage, serialized refreshes, SSE transport, completed-item reconstruction, allowance and provider adapter. Only official `auth.openai.com` endpoints and public `https://api.openai.com/v1/responses` are used; no OpenCode/Codex credential reads, `backend-api`, arbitrary URL or proxy to a coding session.

Actual subscription streams supplied completed message/reasoning items through `response.output_item.done` but sent **`output: []` in `response.completed`**. The old reader rejected the empty array. The new reader retains completed item identities/order, requires terminal completion, rejects unfinished/conflicting/unexpected items, excludes commentary from final structured output, and validates the final JSON with the existing Zod schema. This follows the official SDK's completed-item/phase semantics while handling the observed empty terminal array. Refusals, invalid schemas and truncated/interrupted streams never become valid answers.

HTTP requests use `store:false`, `stream:true`, developer instructions, explicit medium effort, no tools and zero SDK retries. Whole request ≤20 KiB, timeout 22 seconds/call, maximum two calls/customer turn, 1 MiB stream and 16 KiB visible text bounds. **`max_output_tokens` is unsupported on this subscription route and omitted.** Time/byte/cancellation limits do not guarantee provider-side generation stops or impose a server output-token cap.

## Owner-only access and credentials

Both the subscription runtime and expiring customer/Studio scope cookies must be enabled. Exact Origin, localhost/loopback configuration, strict bounded JSON and originating conversation ownership remain required. Subscription conversation create/read/clear/turn endpoints reject ordinary or wrong-scope browsers before dispatch. Public read-only demo visibility grants no model-spending or merchant authority.

Credentials live only in `~/.config/palcare-chatgpt-pilot/` on the owner host: directory `0700`, atomic files `0600`, no symlinks/hardlinks or broad permissions. Mac-local OAuth followed the documented VM transfer flow; the VM retained its own host ID and now owns token refreshes. Do not refresh or revoke the copied Mac session independently. No additional sign-in is needed while VM renewal works.

This is **private host storage, not encryption at rest or OS isolation from the same Unix identity**. Existing Docker-capable-account limitations remain; public deployment still needs the separately documented runtime isolation. No migration/admin/PayPal/model API-key credential is injected into the preview. Credentials and scope tokens never appear in Git, URLs, browser storage, published evidence or traces. Scope cookies are HttpOnly. Private files are excluded from deployment tracing, and actual browser artifacts are scanned against the owner's credentials without printing them.

## Subscription allowance, not an API money budget

**Current approved renewal:** the original expiry below is historical. After explicit owner approval on October 28, only the existing window expiry was extended to **`2026-10-29T22:10:58.310Z`**, preserving scope values, session identity and **28/50 usage with two unknowns**. The browser-access usability change does not renew or extend that window/allowance. [Renewal context and access evidence](evidence/PRIVATE-ACCESS.md).

**Subsequent customer Insights acceptance:** five useful actual Sol Medium calls passed at **2026-10-29T02:14:51.621Z**, leaving **33/50 used**, both prior unknowns and the approved expiry unchanged. The earlier 28/50 observations below remain historical. No new allowance/session, renewal, paid API fallback or application migration occurred. Check the real state before any further useful call; this snapshot is not future permission. [Customer tasks, SDK evidence and retained failures](evidence/CUSTOMER-INSIGHTS.md).

The owner first approved 30 additional requests, then increased this same session to **50 total**. The original quality evaluation used **25**. The later focused [CareOS UX acceptance](evidence/CAREOS-UX.md) used **3 more**, making **28/50 used**, with two prior unknowns retained and the original expiry unchanged. The owner allowed up to 50 new requests if necessary; no new cap/session was needed. `extend-to-50 --credits-disabled` changes only the cap; attempts, approval/expiry, provider blocks, original failed pilot and unknown calls are retained. No reset or identity rotation. Session expiry remains 24 hours from original authorization.

Every dispatch is durably recorded before its one POST under a cross-process lock. Unknown/failed calls consume a slot. Calls are serial and separated by at least 500 ms, with existing browser turn limits retained. A repeated request/schema cannot redispatch. Provider authentication/eligibility/usage denials block the session; no paid API or other-model fallback occurs. Acceptance runs use a different lock so test evidence cannot race while provider calls remain serialized. Failed acceptance cases return nonzero exit status.

The owner confirmed **additional paid-credit use OFF** in ChatGPT settings, and the app links to **Manage ChatGPT usage**. There is no documented setting-inspection endpoint here: this is an owner attestation, not machine-verified billing proof. Usage is shared with the owner's plan/OpenCode/Codex; request/token counts are not API charges or an estimate of remaining subscription allowance. Unknown usage is not assumed zero.

## Private operational commands (GreatBison only)

No command below creates a new approval or resets a consumed session. Operator state must already exist.

```bash
pnpm exec tsx scripts/subscription-private-app.ts start
pnpm exec tsx scripts/subscription-private-app.ts verify-preservation
pnpm exec tsx scripts/report-subscription-quality.ts
pnpm exec tsx scripts/verify-subscription-secrets.ts
```

The launcher reads only the existing restricted runtime URLs from the original private runtime configuration, verifies actual authority/evidence guards, snapshots original source/CareOS evidence and spawns a clean loopback-only process. Administrator/provider credentials are not inherited. Preservation checks compare source-row hashes, original CareOS rows, legacy spend buckets and unchanged schema; no historical rows are rewritten.

`scripts/evaluate-subscription.ts --run <phase>` is an **owner-run live acceptance tool**, never CI. Each named phase runs once and preserves failures instead of overwriting expectations. It drives actual browser conversations/Studio tools, and consumes the shared subscription allowance. Do not rerun completed phases or use a new journal to bypass the allowance. Tests default to fixtures/injected transports and cannot activate subscription inference by themselves.

The separately reviewed `scripts/evaluate-careos-ux.ts --run` uses the same evaluation lock and sole subscription usage journal. It creates an exclusive append-only UX evidence file, its own browser/conversation and at most two care turns/four provider calls. Actual acceptance passed six tasks with three calls. It never clears an existing transcript, retries an uncertain request or changes session authority. Default invocation without `--run` exits without application/model work; do not rerun the completed acceptance.

Mac application access needs an SSH loopback forward to port 3002 plus the matching private `/ai-evaluation` scope unlock. Scope tokens are application capabilities, not OpenAI tokens; never paste them into chat. Guide the owner one Mac command at a time. No Mac Remote Login or public listening port is needed.

### Persistent browser access

Keep the tunnel open and use **the same normal browser profile and `http://127.0.0.1:3002` hostname**. Bookmark `/ai-evaluation` for independent Customer/Studio status, exact server-configured expiry and workspace links. Already authorized scopes need no token. Refresh, returning to the page and **Check access** read status without model calls or cookie renewal.

**Normal owner setup no longer requires scope-token transfer.** Select the requested Customer/Studio scopes, choose **Connect selected scopes via SSH**, copy/run its generated approval command in a new Mac Terminal tab (leave the existing tunnel open), then choose **Finish owner connection** in the same browser within five minutes. The command contains only a non-secret request ID and exact scope list. It executes as the existing owner account over SSH; the same browser must also possess the separate random HttpOnly pairing secret. Approve only the request shown in your own local browser, never an unsolicited code. This is a bounded host-authorized bootstrap into the existing cookies, not localhost auto-login or a new customer account system. The token form remains under **Advanced** as an emergency fallback.

The existing scope cookies are persistent, HttpOnly, host-only and SameSite=Strict (Secure on HTTPS). Neither an SSH session ID nor a process ID participates in authorization; the private launcher reuses saved scope values. Reconnect the tunnel after network/host restarts; reenter a token only if its scope is missing. `localhost` and `127.0.0.1` have different cookie stores; keep the exact configured origin, normal profile and cookies. Cookies are host-scoped, **not port-isolated**: unrelated untrusted loopback web apps on that hostname are outside this security boundary.

After expiry the server denies access even if the browser retains a cookie. Legitimate operator renewal remains required. If the browser deleted expired cookies, repeat SSH browser pairing after renewal—do not retrieve private tokens. Pending grants are bound to the exact approval window/scope configuration and cannot carry forward into a renewed window. Pairing uses its own protected, bounded `owner-access.json` and short-lived lock; it never rewrites application/session/registration/journal files or increases inference allowances. A stale lock requires owner inspection, not automatic lock stealing or quota resets. No provider/OAuth/API credential belongs in this flow. [Mac instructions, verified network/host boundaries and limitations](evidence/PRIVATE-ACCESS.md).

## Final API switch and remaining gates

The existing Sol Medium API adapter remains intact under `CAREOS_PROVIDER=responses`, with its own project/key, cost reservations and separately approved migration **0016**. Switching requires separate API spending/migration approval and actual API acceptance; subscription success is not API billing acceptance. The current subscription path does not need 0016 or change its guards.

Public hosting, operator OS isolation, AG Studio judging-period license coverage, actual Price Guardian refund/recovery, public webhooks, real Channel3 acceptance, real-device and independent first-time-user research remain separate gates. Forma F-01 remains fictional with no manufacturer manual; only the reviewed Raspberry Pi guide has care coverage. One historical CPSC notice is not comprehensive recall monitoring.

Official references: [registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [VM transfer](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms), [models/streaming](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [refresh/usage](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [Responses output arrays](https://developers.openai.com/api/docs/guides/text).
