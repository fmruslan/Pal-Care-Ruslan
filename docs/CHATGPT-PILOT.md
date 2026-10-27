# CareOS ChatGPT subscription — Phase 1 only

**Historical procedure/evidence:** the first pilot failure remains intact. The subsequently approved private application integration is now verified; see [current operation](SUBSCRIPTION-DEVELOPMENT.md) and [actual quality results](evidence/SUBSCRIPTION-QUALITY.md). Do not reconnect or repeat the original pilot to use the current session.

**Actual pilot FAIL / STOPPED:** own-client Mac sign-in, no-credit confirmation, VM import, model discovery and one Sol Medium stream/usage report succeeded. First structured classification was not accepted; remaining two requests were not sent. No runtime integration/migration. [Actual evidence and next gate](evidence/CHATGPT-PILOT.md). Setup below is the original procedure, not instructions to reconnect, transfer again or reset the journal.

## Boundary

- Start from `careos-sol-medium`; reuse its Sol/medium policy, CareOS instructions, Zod schemas, `resolveTurn`/source validation and actual Studio `planDashboard` interface.
- Separate CLI-only helper. No new Next.js route, customer sign-in, web-runtime activation, database dependency, migration, financial request or API-key fallback.
- CareOS registers its **own** OAuth client (`Pal Care — CareOS`), with a persistent per-machine host ID. It never searches for, reads or reuses OpenCode/Codex credentials.
- Official public `https://api.openai.com/v1/responses` with OAuth bearer authorization, `store:false`, `stream:true`, fixed `gpt-6.1-sol` / `medium`, strict structured output and zero retries. No ChatGPT `backend-api` route, undocumented proxy or substituted model.
- Existing API adapter remains prepared and gated, unchanged apart from exporting the existing prompt. The Studio planner accepts its existing structural model interface; its runtime behavior is unchanged.

## Prepared artifacts

```bash
pnpm careos:pilot:build
node dist/careos-chatgpt-pilot.mjs prepare
node dist/careos-chatgpt-pilot.mjs status
```

Build produces a credential-free standalone **Node.js 22+** module with dependency license notices. `jose` 6.2.13 verifies OIDC signatures/claims; `esbuild` 0.28.2 bundles the helper with the existing pinned OpenAI SDK. No noncommercial DevKit source is copied. Build refuses database/environment-loader dependencies.

Owner-only state lives at `~/.config/palcare-chatgpt-pilot/` (`0700`, atomic `0600` files), outside the repository. `host.json` is local to each machine; `registration.json` holds CareOS's own credentials. `pilot.json` retains sanitized request evidence/unknown attempts separately. No tokens in the web environment, URLs, browser storage, Git or diagnostics. Permissions are **not encryption at rest or OS isolation from the same Unix account**. Existing GreatBison same-user/Docker isolation limitations remain; this is private owner testing only.

## Step 1 — Mac-local sign-in, then stop

With Node.js 22+ installed on the Mac, run in **Mac Terminal**, not the GreatBison shell:

```bash
scp -p bigrus@100.96.222.1:/home/bigrus/.local/share/opencode/worktree/ba4124/careos-sol-medium/dist/careos-chatgpt-pilot.mjs "$HOME/Downloads/careos-chatgpt-pilot.mjs"
node "$HOME/Downloads/careos-chatgpt-pilot.mjs" sign-in
```

The helper opens the normal Mac browser. Authorize **Pal Care — CareOS** with the intended account/workspace and grant ChatGPT plan usage. Its callback listener uses an available **Mac-local `127.0.0.1` port**, exact `/auth/callback`, fresh state/nonce and PKCE S256. No Remote Login, public port, Tailscale callback address or pasted authorization code. Signature, issuer, audience, expiry, nonce and returning-account identity are validated before saving credentials. Issued client ID survives a failed code exchange for legitimate later sign-in.

**Sign-in does not transfer credentials, discover models or run inference.** Do not paste callback URLs, registration files, tokens or account screenshots into chat. Report only sanitized error codes. A stale lock after process interruption requires inspection; do not delete state to force a retry.

## Step 2 — verify no additional credit use, then request approval

Open [ChatGPT Settings → Usage](https://chatgpt.com/settings/usage). Select CareOS, set a suitable app allowance, and **disable its use of additional paid credits after the included plan allowance**. Verify relevant automatic credit-purchase settings are off. Plan usage is shared with OpenCode/Codex, not an additional allowance.

**No documented endpoint here lets this helper inspect that setting. Owner confirmation is recorded as an attestation, not machine-verified proof.** If the account UI cannot disable additional credit use or the restriction is unclear, stop without inference. Return to OpenCode to confirm successful sign-in/credit restriction, then explicitly approve secure transfer and execution.

## Step 3 — deferred secure transfer and execution

Only after that approval, transfer **CareOS's own** protected `registration.json` over SSH to the prepared GreatBison directory as `incoming.json`; preserve `0600`. The operator runs `import` on GreatBison. It verifies the imported account token, rejects replacing an active session and **does not import/overwrite the VM's `host.json`**. Successful import removes only its documented incoming staging file. No transfer occurred during preparation.

The VM owns subsequent refreshes. Do not sign in/refresh/disconnect the copied session from the Mac afterward: these are the same transferred session, not independent refresh tokens. OpenAI currently does not provide host-specific attribution/revocation for transferred sessions.

Only after owner sign-in, import and no-credit confirmation:

```bash
node dist/careos-chatgpt-pilot.mjs run --approve-pilot --credits-disabled
```

Flags represent owner approval/attestation, not the ability to alter provider billing settings. The agent must not supply them before the final go-ahead. Execution first confirms the subscription account's live catalog includes Sol, then checks:

1. Existing CareOS intent-classification schema.
2. Real `resolveTurn` with a grounded Raspberry Pi 5/Raspberry Pi OS shutdown question and existing reviewed CC BY-SA source. Only bundled fictional/public reference context; no application DB records.
3. Existing Studio planner/schema over the labeled illustrative dataset. Validate presentation-only commands; **no actual Studio browser tool execution**.

## Usage and failure policy

Durable markers precede dispatch; CLI access is serialized. No automatic retry, resumption, allowance reset or API fallback. Unknown attempts survive interruption. Rerunning `run` cannot silently restart the fixed pilot. Further testing requires review/approval, not deleting the journal or rotating identities.

Only `response.completed`, exact model/medium effort, valid schema/grounding and valid usage counts establish success. Partial text, HTTP 200, `[DONE]`, missing usage, refusal, incomplete/failed streams, admission errors or subscription limits stop the pilot. No model substitution. Store only allowlisted error codes, safe request IDs/status, counts and fixed reference-domain output—not raw bodies or account information.

Measure total/first-event latency, input/output/reasoning/cached tokens, schema and prompt versions. Missing cache-write counts stay explicitly unknown. Do **not** convert these to API charges or claim they reveal remaining plan allowance.

Subscription requests **reject `max_output_tokens`**, so it is omitted. Bounds: 20,000 serialized request bytes, existing Sol 22-second request timeout, 1 MiB streamed bytes and 16,000 visible text bytes, plus confirmed ChatGPT app allowance/disabled additional credits. Cancellation/time/byte bounds **do not guarantee server generation stops or impose a provider-side output-token ceiling**. This is a limited compatibility experiment, not a replacement for runtime spend reservations. Full subscription integration still needs an approved durable allowance policy.

`disconnect` attempts refresh-token revocation, clears local tokens and retains registration/host/evidence. Unconfirmed revocation explicitly directs the owner to disconnect CareOS in ChatGPT settings. No automatic reconnect loops.

## Acceptance/reporting

- **Implemented:** CLI/helper, own-client OAuth, separate VM import, refresh/revoke, streaming and reused domain contracts.
- **Isolated verification:** injected JWKS/OAuth/SSE and a test-created loopback callback are synthetic, not provider evidence. Linux bundle testing is not actual macOS/browser acceptance.
- **Actual application:** unchanged fixture runtime/database; no model-backed browser journey claimed.
- **External result:** **FAIL / STOPPED** at first output-shape contract: one actual completed Sol/medium stream, 3,943 ms, 270 input + 32 output tokens (15 reasoning included). Authentication/model/streaming/usage passed; structured/grounded/Studio acceptance remains incomplete. [Evidence](evidence/CHATGPT-PILOT.md).

A CLI PASS does **not** establish direct readiness or authorize live CareOS/AG Studio browser testing. Next phase needs separate approval, private runtime authorization/allowance integration and resolution of the original application **0015** versus prepared Sol **0016** accounting requirements. No migration/full integration is included here.

### Preparation verification

- Lint, typecheck, Next.js production build, formatting (including nested helper sources), repository checks and `git diff --check`: passed.
- Original preparation: **331 unit tests passed**, including **31** synthetic pilot checks. Catalog correction adds one regression; bounded output-shape diagnostics preserve strict validation. Automated tests never perform hosted inference.
- Existing deterministic/fixture evaluations: **70/70**, zero model/financial calls. Production dependency audit: no known vulnerabilities reported.
- Original Linux preparation had no authorization/inference. Subsequently the owner completed actual Mac sign-in and transferred the protected file; import and one actual inference are recorded separately above. Web runtime remains disabled for subscription inference.
- PostgreSQL/migration/application-browser suites not run for this CLI increment. No application DB or financial execution endpoint accessed. Owner-confirmed Mac helper execution is not model-backed application-browser acceptance.

## Official references

- [OSS ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source)
- [Registration/PKCE/identity/storage](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Self-hosted VM transfer](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [Models/streaming/completion](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [Unsupported parameters](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Refresh/revocation/shared usage](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)
- [Subscription errors](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
