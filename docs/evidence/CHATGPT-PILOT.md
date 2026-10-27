# Official ChatGPT subscription pilot — actual Phase 1 evidence

**Historical record retained.** The owner later approved continued work; completed-item reconstruction fixed the issue and real private application/Studio acceptance followed. [Continuation evidence](SUBSCRIPTION-QUALITY.md). The numbers and FAIL below describe the original pilot, not the current integration.

Date: 2026-10-27. Branch: `careos-sol-medium`.

## Result: FAIL / STOPPED at structured-output contract

Actual OAuth/Responses evidence, not injected transport. This does **not** establish runtime CareOS/Studio readiness or authorize full integration.

| Check | Actual result |
| --- | --- |
| CareOS authorization | Owner completed Mac-local browser sign-in; no OpenCode/Codex credential reuse |
| Additional paid credits | Owner confirmed disabled before execution; attestation, not programmatically queried billing proof |
| Secure VM import | Owner transferred CareOS's own file via SSH; helper verified private directory/file ownership/modes, identity/account/client binding; VM host ID retained |
| Account model discovery | Sol found in actual subscription catalog |
| Model / effort | Completed response matched `gpt-6.1-sol` and medium |
| Streaming | HTTP 200, 16 SSE events, terminal `response.completed` |
| Classification latency | 3,943 ms |
| Reported input / output | 270 / 32 tokens |
| Reasoning | 15 tokens **included** in output; never add again |
| Total / cache | 302 total; 0 cached input / 0 cache-write tokens reported |
| Structured classification | **Not accepted:** `pilot_refusal_or_unexpected_output` |
| Grounded CareOS / Studio cases | **Not sent** after first failure |
| Inference requests | **1 of approved 3** dispatched; no retry/API fallback |
| Application / finance | No runtime activation, DB access/migration, PayPal operation or public deployment |

The response completed with known usage, but its output item/message-content shape failed the helper's existing strict predicate. The original diagnostic did not retain output shape: **refusal versus transport-format mismatch cannot be determined from retained evidence**. Do not invent response text, claim provider structured-output support failed, or silently relax validation. No provider-hosted retrieval was attempted (`store:false`).

The private journal retains the failure/attempt and known usage. Its conservative `state:unknown` marker was not reset/replayed; completed transport/known usage are separately recorded. No account identities, secrets, request IDs, raw payloads or credentials are published here. CareOS authorization remains connected; VM owns refreshes.

## Catalog-bound defect before inference

The initial catalog GET exceeded the shared 256 KiB JSON limit, with **zero inference attempts**. Now **2 MiB is allowed only for the exact read-only public `/v1/models` endpoint**. Token/JWKS reads stay capped at 256 KiB; redirects/timeouts unchanged. A regression checks rich catalogs, oversize rejection and unchanged authentication bounds. Controlled continuation passed discovery; it repeated no inference request.

## Follow-up preparation, not another live request

Added bounded output item/type and message-content-type diagnostics only, preserving the strict predicate. No raw text/reasoning is logged. This cannot recover the original response shape retrospectively.

Further live diagnosis requires owner approval and an explicit plan using the two unused requests (or separate allowance). Do not rerun/reset the journal, rotate registrations, substitute models, enable API fallback or start full integration to bypass the failed gate.

Automated tests use synthetic OAuth/JWKS/SSE separately from the one actual inference above. Model-backed application browser execution, semantic care grounding, actual Studio tools and durable subscription-runtime accounting remain incomplete. Original app stays fixture/0015; prepared Sol API migration 0016 is not applied.

Follow-up local checks passed: **332 unit tests** (32 pilot cases), lint, typecheck, Next.js production build, formatting (including nested helper sources), standalone-helper build and diff checks. Final actual status: connected, plan permission present, pilot FAIL, **one** inference attempt, subscription web runtime disabled. No further model request was sent while testing the diagnostic change.
