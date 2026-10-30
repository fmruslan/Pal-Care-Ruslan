# Persistent private-owner CareOS

Implemented for the exact private HTTPS origin. **The owner subsequently approved activation with 300 provider requests, four concurrent requests, 30/minute and at most one safe counted retry.** Activation/provider acceptance results are recorded in STATUS/handoff, not inferred from configuration or isolated tests. The original disabled delivery and request-only/four-hour workflow remain historical.

## Independent layers

- **Browser identity:** one-time browser-bound request, approved through the existing trusted host account. The random 256-bit secret is Secure, HttpOnly, SameSite=Strict, host-only and `__Host-` prefixed; only its SHA-256 digest is stored. A public request ID cannot finish pairing. Requests expire after five minutes and approval is single-use. Finish sets a persistent cookie; server checks enforce **30 days absolute / seven days inactive**, browser-agent binding, logout and host-CLI revocation. Activity touches are bounded to once an hour. No automatic owner/policy renewal.
- **Standing permission:** immutable exact policy, separate from browser identity, with no four-hour expiry. Fixed subscription provider, Sol/medium, exact HTTPS origin, explicit customer/customer-Insights scopes, atomic total/rate/concurrency limits. Recognition does not install/replenish permission. Revocation/exhaustion stops dispatch.
- **Provider connection:** existing own-client registration/subject/host identity remains unchanged. Direct-invoke scopes are checked. Refresh occurs only near expiry under the original provider cross-process lock, after owner/policy/quota checks. Same issued client/latest replacement token; no account switching or API/paid-credit fallback.
- **Commerce:** unchanged and disabled in the private launcher. AI gains no payment, checkout, refund, operator, migration or database-administration authority. Merchant Studio retains its separate legacy gate.

## Storage and accounting

New state: **`~/.config/palcare-standing-owner/owner-state.json`**, not the historical pilot directory. Existing protected-file checks enforce owner UID, private modes, no symlinks/hardlinks, bounded size, exclusive locks and fsynced atomic replacement. An independent owner lock allows logout/revocation during a provider request.

Accounting is a **logical append-only event ledger in atomic snapshots**, not filesystem WORM storage. Reservations and terminal observations retain prior events; no API prunes history or releases consumed requests. Sanitized request IDs/status/token counts may be stored, never prompts, responses or credentials. The immutable policy links the original journal using SHA-256 of `JSON.stringify(parsed session.json)`; dispatch rejects a mismatch. The expired **33/50 including two unknowns** remains intact; its unused 17 requests never become capacity.

Each actual Responses POST rechecks authority and durably reserves before dispatch. Chat can use two planning calls/turn; customer Insights one. Including a safe retry per call, their maximum provider attempts are four/two respectively. Failed/unknown outcomes retain their charge. A terminal observation releases only concurrency, not budget. A crash without an observation retains that concurrency slot; no timeout steals/recycles reservations. Storage caps fail closed (128 browser records, 3,000 events, 1 MiB); reviewed maintenance is required if reached. No rollover/new policy/reset is automatic.

The provider lock serializes token access/refresh only; inference runs concurrently within the atomic owner ledger limit. Bounded contention waits never steal a stale lock or rerun started work. HTTP 401/403/429 and relevant denial codes persist a provider block, with no automatic unblock/reset-time claim. Only HTTP 503 rejection before a stream with exact `subscription_sharing_usage_unavailable` / `subscription_sharing_user_unavailable` codes permits one retry after backoff and fresh authority/quota checks; both attempts remain charged. Arbitrary 5xx, network failures, cancelled/partial streams and unknowns are not retried. Documented terminal refresh errors clear unusable tokens while retaining client/subject mapping. Invalid-client, infrastructure, network and malformed/lost responses retain credentials/pending marker; no replay of a possibly rotated token. Unknown refresh requires review/reauthorization.

## Controls and host operations

Open **AI access** in CareOS, or `/ai-evaluation`. Status includes approved used/remaining requests, unknown reservations and provider metadata; controls include one-time verification, sign out and policy revocation. GET/status never refreshes credentials or consumes model quota. Home/Purchases/Insights/Documents remain available independently.

From the primary checkout, approve only the ID shown in your own browser:

```sh
pnpm exec tsx scripts/standing-owner.ts approve-browser REQUEST_UUID
pnpm exec tsx scripts/standing-owner.ts revoke-browser SESSION_UUID
```

Do not approve untrusted IDs. Click **Finish remembering browser** within five minutes. Pairing is not spending/financial approval. Sign out revokes that browser, not the provider connection. Revoke AI permission stops future dispatch for every browser, without erasing records or remotely revoking credentials.

Following the owner's exact approval, a protected `standing-approval.json` can be installed with `scripts/standing-owner.ts approve-policy standing-approval.json`. Its strict schema includes UUID/approval timestamp, historical hash, provider/model/reasoning/origin/scopes, total cap, concurrency, requests/minute, maximum safe retries and explicit credits-off/provider-permission confirmations. The installer verifies history and refuses replacement policies; no network work. The launcher now enables standing mode under that approval; it cannot grant usage without a valid installed policy/browser. Actual provider checks and bounded acceptance remain required. Metadata/catalog reads and OAuth refreshes are not model requests; report them separately, never as inference or capacity proof.

## Owner-approved settings — supersede the original 100-request proposal

| Setting | Approved limit; actual activation reported separately |
| --- | --- |
| Provider | Existing CareOS-owned ChatGPT subscription registration; same user/client/host |
| Model / effort | `gpt-6.1-sol` / `medium` |
| Scopes | Customer chat + customer Insights presentation; no merchant/financial scope |
| New total budget | **300 provider requests**, no reset/rollover; separate from expired history |
| Concurrency / rate | **4 active requests / 30 provider requests per rolling minute** |
| Automatic retries | At most **one**, only the safe pre-stream rejection described above; counted against all limits |
| Policy lifetime | Until revoked/exhausted/blocked; no four-hour application window |
| Browser lifetime | 30-day maximum / seven-day inactivity timeout; revocable |
| Preconditions | Exact approval; actual eligibility/credits-off and supported same-user self-hosted use confirmed; history link; separately approved bounded real refresh/inference acceptance |
| Stop conditions | Revocation, missing/expired browser, exhaustion, provider denial, accounting/refresh uncertainty, changed history, unsupported capability |

## Provider review and limitations

Official references reviewed: [self-hosted VM](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms), [serialized refresh](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [token lifetimes](https://developers.openai.com/siwc/token-sharing-open-source/token-reference), [errors/recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery). One-hour access tokens/rotating 30-day refresh tokens are not spending permission. Existing Responses retains public `/v1/responses`, `store:false`, `stream:true`, no retry and no unsupported output-token ceiling.

Subscription capacity/eligibility is not guaranteed or measured by our counter; credits-off/provider settings are not machine-verifiable here. Personal self-hosted support is not blanket public/judge entitlement. Judges require separately approved isolated credentials/budget/hosting/licensing, preferably a dedicated API project; no personal credential sharing or paid activation here.

Agent binding reduces simple cookie copying, **not same-agent replay after theft**. Secure/HttpOnly/SameSite cookies, exact Host/Origin and revocation are defenses, not cryptographic device proof. Cookies are not port-isolated. Trusted same-host services, owner SSH/Unix identity, Docker/root and browser compromise remain threats. No independent penetration test, public isolation, provider uptime or real-device acceptance is claimed. Revocation cannot retract an already dispatched request. Native Studio watermark/license limitations remain unchanged.

Results, initial failures, actual observations and exact-commit CI are separate in STATUS/handoff. Injected tests are not live-provider proof.
