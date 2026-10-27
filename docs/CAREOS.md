# CareOS — Glance, Tap, Talk

## Current boundary

CareOS is one persistent customer assistant plus factual briefings/actions, inline documents and scoped care sources. Default **fixture** remains labeled **Demo responses · no live AI**. Owner-only **subscription** mode now has actual Sol Medium conversation/Studio acceptance on the original 0015 database. It uses CareOS's own official ChatGPT authorization, never OpenCode/Codex credentials. [Current private operation](SUBSCRIPTION-DEVELOPMENT.md) · [actual quality evidence](evidence/SUBSCRIPTION-QUALITY.md). The API-key adapter remains prepared and separately gated under [API acceptance](AI-EVALUATION.md).

No CareOS operation can create/capture/reconcile/refund a payment or mutate trusted commerce/knowledge/recall records. No customer account, upload, arbitrary-web-fetch or continuous monitoring. Studio has its own presentation-only scope and no customer history/financial authority. Both scopes share the subscription request allowance (or separately activated API budget), not each other's credentials. Disabled Studio assistance remains explicitly scripted.

## Try it without paid APIs

Use the existing OpenCode coding session for development review; no website access to its authentication. `pnpm careos:review --examples` runs 14 fictional, no-network task cases for AI-assisted review here. It does not run hosted Sol or prove semantic correctness; [review evidence and negative control](evidence/OFFLINE-AI-REVIEW.md). API project/key creation, billing and actual 0016/live activation are currently deferred by owner direction until final integration.

```bash
APP_ORIGIN=http://localhost:3000 pnpm dev
```

With `DEMO_DATA_SOURCE=fixtures` (default), no database or provider credentials are required. Open `/dashboard`: receipt and care suggestions go directly to records. Open a Twin and Ask CareOS to find its receipt. The separate Raspberry Pi 5 sample has a documented safe-shutdown example; Forma F-01 correctly has no manufacturer guide. [Source attribution and licence](CARE-SOURCES.md).

The original Phase B restricted-reader/CareOS cutover through **0015** passed. Subscription inference uses that existing conversation schema with its own protected request/token journal and needs no migration. The prepared **API-dollar** accounting path still requires approved **0016** before its live readiness. Never seed/reset the application. [Setup](SETUP.md) · [Phase B evidence](evidence/PHASEB-CUTOVER.md).

## Architecture

`src/components/careos/provider.tsx` mounts once under the existing root theme provider. Pages register validated Twin or explicit example context; navigation does not remount checkout. The assistant remains available on dashboard, Vault, documents, care, Guardian, safety and replacement routes, hidden on merchant/checkout/marketing routes. Reference context is fictional ownership with no invented Twin or receipt. Desktop uses a persistent nonmodal dock (closable to use the page beneath); mobile/tablet use a modal sheet. Returning to the customer space retains the transcript; old answers retain their original product labels.

The focused finish keeps this host: 16px-relative conversation text, labeled Send, compact execution/evidence hierarchy, 44px primary targets, wide-desktop compact reading space and mobile visible-viewport sizing. Layout/keyboard/appearance changes never send a financial/model request or remount checkout. Injected keyboard geometry, 200% root-font simulation and axe scans are explicitly not real-device or full accessibility certification. [UX evidence](evidence/CAREOS-UX.md).

`src/lib/careos/` separates contracts, security, deterministic tools, briefing, product-filtered retrieval, provider adapters, grounding, persistence and orchestration. Simple receipt/record tasks bypass the model. Ambiguous language may use one classifier call, then one grounded care call at most. There is no autonomous tool loop, model-written HTML/SQL, model-chosen URL or financial tool.

### Evidence and actions

- Fixed server-side fictional customer/merchant scope. A Twin ID is checked through `findTwin`, never accepted as authority on its own.
- Receipts are joined to the exact Twin. Two purchases of the same model do not share receipts.
- Selection answers offer authorized dated purchases inline, with Sample/Verified Sandbox labels and short Twin identifiers. Nothing is preselected. Choosing a radio alone neither navigates nor sends; **Use this purchase and continue** explicitly selects/navigates and submits the original question as a new request. Historical selectors cannot replay stale questions. Matching occurs before the display limit; unknown products still receive no substituted receipt or source.
- Knowledge matches product ID, brand and model before bounded lexical/tag ranking. Up to four reviewed passages, 4,000 characters each; assembled context fits 14,000 UTF-8 bytes, and the whole model request must fit 20,000 bytes. Source URLs match the reviewed official HTTPS documentation host/path.
- Source records preserve publisher, official URL, section, review date, revision, language, licence, status and SHA-256. Content hash mismatch fails visibly.
- Approved/withdrawn/conflicting sources remain distinct. An approved source is a human-curated database designation, never an LLM approval.
- Care steps require a supplied source ID/verbatim quote. Application code renders the actual source line (or exact bounded quote), never an unverified paraphrase; source support alone still does not prove applicability. Unknown IDs/quotes, extra fields, arbitrary URLs and financial/coverage claims are rejected. All links/actions are application-generated.
- Zod and quote validation **do not prove semantic correctness**. Prompt injection cannot be guaranteed eliminated. Live model grounding and refusal behavior still require evaluation.
- Explanations are short, with expandable sources. No chain-of-thought is requested or displayed.
- Answers show one primary contextual action (an available receipt takes precedence), with secondary links under **More options**. Consequential source/payment uncertainty remains in the answer or its existing visible provenance. Missing manuals lead to the selected purchase’s saved documents, not an invented guide. Date/amount questions lead with the requested fact; deterministic retrieval and source-wording guards remain unchanged.

### Conversation state

A separate 256-bit HttpOnly/SameSite=Lax cookie binds access; only its SHA-256 digest is stored. It grants no checkout or merchant authority. Browser session storage holds a conversation UUID and, while a question is unresolved, one bounded recovery hint (`palcare-careos-pending-v1`): its original request envelope, display context, conversation ID and creation time. The hint expires after 24 hours and is removed after canonical recovery or successful clear. It is not credentials, trusted history or authorization; all scope checks remain server-side. Do not enter personal information. Storage denial retains in-memory operation but cannot promise reload recovery. Different independently opened tabs create different conversations; an opener-cloned tab can inherit its session-storage identifier. Its turns still carry explicit Twin context. There is no cross-device memory promise.

PostgreSQL mode uses `care_conversations`, `care_requests`, `care_buckets` and `care_model_calls`. Fixture-data mode uses bounded ephemeral memory and cannot enable paid inference. Expiry is 24 hours, with 40 requests per conversation. Clear deletes transcripts/call rows, never spending counters. Expired content is inaccessible; physical removal requires private cleanup. No always-running worker is claimed. No personal information or raw prompt/provider logging is permitted.

Each turn snapshots its Twin/context revision. Old messages retain product labels. Up to four recent same-Twin turns enter bounded interpretation context. Repeated vague follow-ups recover the last grounded topic, not just the immediately preceding question, while loading current exact-model evidence. Explicit mismatched models/receipt targets require selection instead of substituted documents. Requests have persisted IDs/fingerprints and a 60-second lease. Unknown dispatches are not automatically retried; their individual API reservations/subscription slots remain consumed. A later new turn may proceed after a stale lease; completed unavailable results replay without dispatch.

The client displays the submitted question before awaiting transport, retaining its original UUID/message/context/revision. It admits one submission at a time and guards clear during restoration/sending. A failed POST is followed by one read-only transcript GET because the server may already have saved a terminal unavailable result. An absent result remains uncertain, not permission to resend. Reopen/reload and **Check for saved answer** use GET only for existing conversations; they never replay a turn POST. While a local question remains unresolved, further sends are blocked until a canonical result is recovered or the conversation is explicitly cleared (server leases still apply). No retry loop, fabricated progress or client cancellation of provider work is added. [UX evidence and remaining increments](evidence/CAREOS-UX.md).

## Requests and limits

Mutations require the exact configured `APP_ORIGIN`; localhost HTTP or HTTPS only. JSON is bounded to 16 KiB; messages to 2,000 characters. Input accepts no arbitrary history, actor, merchant, tool, provider URL or amount. All conversation responses are private/no-store; errors are sanitized.

Persistent database limits:

| Resource | Limit |
| --- | --- |
| Conversation creation | 10/session/hour; 500 globally/day |
| Turns | 6/session/minute; 30/session/hour; 5,000 globally/hour |
| Transcript | 40 requests; 24-hour access expiry |
| API model calls | 2/turn; 200 globally/hour; 500 globally/day |
| Subscription calls | 2/customer turn; serial, ≥500 ms spacing; owner session initially 30, explicitly increased to 50 total with no reset |
| Model payload/output | Request ≤20,000 bytes. API: 6,000 output tokens including reasoning. Subscription: no supported output-token cap; 1 MiB stream / 16 KiB visible text guard |
| Model work deadline | 50 seconds shared across retrieval/calls; SDK timeout 22 seconds; 60-second lease; retries off |

The account-free preview has in-memory caps rather than durable distributed protection: 500 active conversations, five per cookie, six turns/minute and 40 turns/conversation. Restart expires preview conversations. It cannot spend API credits.

## API-key activation — separate from approved subscription development

**Do not activate as part of fixture acceptance.** Before a real runtime test:

1. Follow [the fixed acceptance procedure](AI-EVALUATION.md): separate project/key, provider **enforced** hard limit (alerts alone insufficient; enforcement can lag), independent scope capabilities and explicit owner budget approval.
2. Prepare a restricted CareOS database login using reviewed `scripts/careos-role.sql`; no commerce/knowledge-write grants or inherited owner memberships. Set `CAREOS_DATABASE_URL`. Live reservations reject commerce-capable writers before dispatch.
3. Set `DEMO_DATA_SOURCE=database`, exact `APP_ORIGIN`, `CAREOS_PROVIDER=responses`, `CAREOS_LIVE_ENABLED=true`, server-only `CAREOS_API_KEY`, and explicit micro-USD daily/total budgets plus stable `CAREOS_BUDGET_ID`. Restart the server after changing runtime configuration.
4. Only reviewed endpoint/model: `https://api.openai.com/v1`, `gpt-6.1-sol`, fixed medium reasoning/standard tier. Other models/endpoints/tiers fail closed. Official documentation confirms protocol support; project access/real inference remain unverified. 0016 and private local evaluation gates are required before dispatch.
5. Run the versioned scenarios in `tests/fixtures/careos-evaluation.ts` with a human grounding rubric, adding real provider refusals/errors. Compare source/model/prompt versions, latency, token usage and spend. Fixture results are not live-model evidence.
6. Publish sanitized actual-runtime evidence before claiming live AI or hackathon runtime completion.

Budgets use integer micro-USD; maximum daily/lifetime caps are **$5 each**, shared across customer and Studio. Proposed first daily test cap **$0.50**, not authorized yet. Each Sol call atomically reserves **$0.12**, based on bounded whole-request input/cache-write/output cost. Known usage accounts uncached/cached/cache-write tokens and reasoning-inclusive output at reviewed Sol standard rates; malformed/missing usage or ambiguous failures retain reservations. Known billed refusals/invalid output still settle. Persist metadata, not prompts. Never rotate IDs or clear usage to bypass a cap. Legacy $0.04 reservations remain unchanged and settle against their saved amount; 0016 does not backfill them.

Each call has its own persisted reservation and original bucket references. Known usage for call two can settle while call one remains unknown. Reverse-order/concurrent settlement is safe; identical replay releases no additional money, changed usage conflicts, and missing buckets roll back every release. UTC rollover does not move the reservation to a new daily bucket. A reported cost exceeding its reservation persists a spending block, not an invented successful settlement. Legacy aggregate unknown usage is not backfilled. History/attention and Glance consume one read-only source-labeled activity projection; partial evidence is explicit and never treated as safety or coverage confirmation.

`store:false` avoids persisted Response application state, not all provider abuse-monitoring retention. No hosted Conversations API or unbounded `previous_response_id` chain is used; each call receives an application-curated bounded context. Native Responses output items are not replayed.

Official references: [Responses structured outputs](https://platform.openai.com/docs/guides/structured-outputs), [JavaScript SDK](https://github.com/openai/openai-node), [Sol model/pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [data controls](https://developers.openai.com/api/docs/guides/your-data), [separate ChatGPT/API billing](https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform).

## Verification and remaining work

`pnpm careos:evaluate` runs **70 deterministic/fixture tasks**, not model inference. Unit/protocol, legacy-reservation, shared-budget and isolated Studio tests complement the separately recorded **actual subscription browser journeys**. Original port 3000 stays on its prior fixture build; private port 3002 is the subscription preview over the same restricted database. [Actual evidence](evidence/SUBSCRIPTION-QUALITY.md) · [recall](RECALL-GUARDIAN.md) · [replacement](REPLACEMENT-CONCIERGE.md) · [merchant framework](INTELLIGENCE.md).

CI runs deterministic/fixture evaluations, injected Responses protocol tests, dedicated PostgreSQL concurrency/budget tests, and browser/accessibility checks in both data modes. No CI secrets can enable paid models or PayPal.

Before submission: owner-approved live model test, human first-time-user task testing, real-device mobile checks and separately approved public hosting. Simulated transport, Chromium mobile emulation and automated axe scans are not live inference, real-device certification or a complete security/accessibility audit.
