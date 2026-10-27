# Sol Medium integration — implementation and isolated evidence

Date: 2026-10-26. Baseline: `9605694` (Phase B closed for private use).

## Implemented

- Official Responses SDK 7.43.0, fixed `gpt-6.1-sol` / `reasoning.effort: medium`, standard tier, strict Zod structured output, no retries/storage/tool access. Official model documentation confirms support; no live account/inference claim.
- Exact-model care with reviewed-source quotes, same-Twin history, bounded context, deterministic retrieval/calculations/status/next-actor facts and AI fact selection for explanations. New known/missing/next/finished resolution disclosure; existing Blue/Lavender identity/theme/reduced-motion behavior retained.
- Actual Studio custom runner with server model-planned, validated presentation vocabulary, up to three commands plus schema tool; no arbitrary SQL/widgets/URLs/financial mutations. Separate customer/merchant capabilities and owners, shared model/effort/budget; scripted mode still explicitly labeled.
- Private expiring evaluation access, project/hard-limit confirmation, $5 lifetime maximum, proposed $0.50 first stage, $0.12 atomic reservation/call, accurate input/cache-write/cache-read/reasoning-inclusive output accounting, usage/latency/prompt/pricing metadata, known-error settlement and unknown-cost retention.
- Prepared **0016_sol_medium_reservations**: nullable usage JSON; permits new $0.12 while retaining old $0.04 values. No historical repricing/backfill/commerce mutation/new table/role. Application migration remains separately unapproved/unapplied.
- Owner-only model visibility and fixed live-acceptance commands require explicit approval flags; no CI credentials or runtime fake-provider option. [Key setup, budget and semantic evaluation rubric](../AI-EVALUATION.md).

## Isolated verification

| Check | Result |
| --- | --- |
| Unit | 284 passed (including model/effort/project gates, cached/reasoning cost, malformed usage, refusals/incomplete/invalid JSON, cancellation without retry, independent scope expiry, selection grounding, pending-vs-verified, presentation-only plans and next-step context) |
| PostgreSQL | 112 passed against an explicit dedicated database in a **separate new PostgreSQL 17.10 container/volume**, loopback test port; no original database URL/volume |
| Migration 0015→0016 | Legacy known/unknown call values preserved; settlement uses saved reservation; new real restricted writer handles $0.12; two scopes race safely on one cap; idempotent/conflicting settlement, metadata and unknown-cost preservation after transcript deletion pass; repeated migration no-op |
| Actual Studio/Sol application path | Two desktop-light/mobile-dark browser journeys passed with **injected HTTP responses** and real SDK schema/presentation execution, scope rejection, grounded care and reload persistence. External provider networking denied by a test-only Node preload, never a production provider switch |
| Fixture browser regression | 348 passed, existing visual references unchanged |
| Database browser regression | 348 passed with genuine disposable restricted logins in the separate test container |
| Synthetic Guardian lifecycle | Six viewport/theme projects passed; test DB/injected provider only, not PayPal |
| Outage / test-role cleanup | Two passed against production build/dedicated test scope |
| Deterministic/fixture evaluation | 70/70 passed, zero model/financial calls |
| Lint / typecheck / production build / formatting | Passed; a worktree-external dependency symlink initially prevented Turbopack resolution, corrected by an offline frozen local install with no dependency changes |

Focused Firefox/WebKit and exact-commit GitHub Actions results are recorded at delivery after completion, not guessed from earlier runs. Financial/provider data in tests is explicitly synthetic. Injected Responses are **not** hosted Sol accuracy, latency, real billing or sponsor acceptance. Mobile emulation is not real-device testing.

## Actual application and external blockers

The original private application remains on its prior production build, restricted accounts and **0015/fixture** configuration. No migration, role/credential/configuration change, paid model call, PayPal call, public access or deployment occurred in this implementation worktree. Phase B and encrypted recovery evidence are retained. New behavior is not claimed accepted against that original runtime.

To close hosted integration acceptance: separate owner approval for 0016/live evaluation, dedicated project/key and enforced provider limit, read-only model visibility check, fixed capped real Responses test, human semantic/source review and actual Studio execution; then disable live evaluation and reconcile usage. Public OS isolation, AG Studio public license/judging access, Channel3, actual refund/recovery, webhooks and deployment remain separate tasks. No framework/architecture rewrite or general infrastructure audit is introduced.
