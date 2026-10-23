# CareOS — Glance, Tap, Talk

## Current boundary

CareOS is implemented as one persistent customer assistant plus deterministic briefing/actions, inline documents and scoped product-care sources. The default provider is **fixture**, clearly labeled **Demo responses · no live AI**. The official OpenAI Responses adapter is implemented and tested using injected HTTP transport. **Hosted inference is not activated or verified.** ChatGPT/OpenCode subscription credentials are never reused by the website.

No CareOS operation can create/capture/reconcile/refund a PayPal payment or mutate a merchant/purchase/document/Guardian/recall record. There is no customer account, upload, arbitrary-web-fetch or continuously deployed monitoring. Continuation adds deterministic scoped CPSC explanations and replacement navigation, not hosted inference. Merchant AG Studio assistance is a separate, explicitly scripted runner; it is not this customer's model or financial authority.

## Try it without paid APIs

```bash
APP_ORIGIN=http://localhost:3000 pnpm dev
```

With `DEMO_DATA_SOURCE=fixtures` (default), no database or provider credentials are required. Open `/dashboard`: receipt and care suggestions go directly to records. Open a Twin and Ask CareOS to find its receipt. The separate Raspberry Pi 5 sample has a documented safe-shutdown example; Forma F-01 correctly has no manufacturer guide. [Source attribution and licence](CARE-SOURCES.md).

Current database mode requires reviewed migrations through **0015**, a restricted reader and a separate CareOS login even for fixture answers. Existing application upgrades require separate approval and row-preservation verification; do not seed/reset an existing financial database. No fake Sandbox capture is seeded. [Current setup](SETUP.md) supersedes historical upgrade commands; actual Stage 5 application configuration/migration remains blocked.

## Architecture

`src/components/careos/provider.tsx` mounts once under the existing root theme provider. Pages register validated Twin or explicit example context; navigation does not remount checkout. The assistant remains available on dashboard, Vault, documents, care, Guardian, safety and replacement routes, hidden on merchant/checkout/marketing routes. Reference context is fictional ownership with no invented Twin or receipt. Desktop uses a persistent nonmodal dock (closable to use the page beneath); mobile/tablet use a modal sheet. Returning to the customer space retains the transcript; old answers retain their original product labels.

`src/lib/careos/` separates contracts, security, deterministic tools, briefing, product-filtered retrieval, provider adapters, grounding, persistence and orchestration. Simple receipt/record tasks bypass the model. Ambiguous language may use one classifier call, then one grounded care call at most. There is no autonomous tool loop, model-written HTML/SQL, model-chosen URL or financial tool.

### Evidence and actions

- Fixed server-side fictional customer/merchant scope. A Twin ID is checked through `findTwin`, never accepted as authority on its own.
- Receipts are joined to the exact Twin. Two purchases of the same model do not share receipts.
- Knowledge matches product ID, brand and model before bounded lexical/tag ranking. Up to four reviewed passages, 4,000 characters each; assembled context drops old history/low-ranked whole passages to fit 19,000 UTF-8 bytes before spending authorization. The adapter independently rejects payloads over 20,000 bytes. Source URLs must match the reviewed official HTTPS documentation host/path.
- Source records preserve publisher, official URL, section, review date, revision, language, licence, status and SHA-256. Content hash mismatch fails visibly.
- Approved/withdrawn/conflicting sources remain distinct. An approved source is a human-curated database designation, never an LLM approval.
- Care steps require a supplied source ID and verbatim supporting quote. Unknown IDs/quotes, extra structured fields, arbitrary URLs and financial/coverage claims are rejected. All rendered links/actions are constructed by application code.
- Zod and quote validation **do not prove semantic correctness**. Prompt injection cannot be guaranteed eliminated. Live model grounding and refusal behavior still require evaluation.
- Explanations are short, with expandable sources. No chain-of-thought is requested or displayed.

### Conversation state

A separate 256-bit HttpOnly/SameSite=Lax cookie binds access; only its SHA-256 digest is stored. It grants no checkout or merchant authority. Browser session storage holds a conversation UUID, not credentials or trusted history. Different independently opened tabs create different conversations; an opener-cloned tab can inherit its session-storage identifier. Its turns still carry explicit Twin context. There is no cross-device memory promise.

PostgreSQL mode uses `care_conversations`, `care_requests`, `care_buckets` and `care_model_calls`. Fixture-data mode uses bounded ephemeral memory and cannot enable paid inference. Expiry is 24 hours, with 40 requests per conversation. Clear deletes transcripts/call rows, never spending counters. Expired content is inaccessible; physical removal requires private cleanup. No always-running worker is claimed. No personal information or raw prompt/provider logging is permitted.

Each turn snapshots its Twin and context revision. Old messages retain their product labels. Up to four recent same-Twin turns (including care steps, not just introductions) enter bounded classification/explanation context. Explicit references to a different known product require a safe selection instead of returning the current product's receipt. Ambiguous live follow-ups can reuse that same product's previous retrieval topic, never another Twin's history; the model must still cite fresh supplied passages. Requests use persisted IDs/fingerprints; altered replays are rejected. A single 30-second conversation lease prevents concurrent execution. Unknown dispatches are not automatically retried; their reservations remain charged. A later *new* turn may proceed once the stale lease expires.

## Requests and limits

Mutations require the exact configured `APP_ORIGIN`; localhost HTTP or HTTPS only. JSON is bounded to 16 KiB; messages to 2,000 characters. Input accepts no arbitrary history, actor, merchant, tool, provider URL or amount. All conversation responses are private/no-store; errors are sanitized.

Persistent database limits:

| Resource | Limit |
| --- | --- |
| Conversation creation | 10/session/hour; 500 globally/day |
| Turns | 6/session/minute; 30/session/hour; 5,000 globally/hour |
| Transcript | 40 requests; 24-hour access expiry |
| Model calls | 2/turn; 200 globally/hour; 500 globally/day |
| Model payload/output | 20,000 UTF-8 bytes; 1,200 output tokens |
| Model work deadline | 20 seconds shared across retrieval/calls; SDK timeout 18 seconds; SDK retries off |

The account-free preview has in-memory caps rather than durable distributed protection: 500 active conversations, five per cookie, six turns/minute and 40 turns/conversation. Restart expires preview conversations. It cannot spend API credits.

## Live activation — requires separate owner approval

**Do not activate as part of fixture acceptance.** Before a real runtime test:

1. Obtain approval for model API spending. Configure a separate API project/key and provider hard spend limit; ChatGPT subscription billing is separate.
2. Prepare a restricted CareOS database login using reviewed `scripts/careos-role.sql`; no commerce/knowledge-write grants or inherited owner memberships. Set `CAREOS_DATABASE_URL`. Live reservations reject commerce-capable writers before dispatch.
3. Set `DEMO_DATA_SOURCE=database`, exact `APP_ORIGIN`, `CAREOS_PROVIDER=responses`, `CAREOS_LIVE_ENABLED=true`, server-only `CAREOS_API_KEY`, and explicit micro-USD daily/total budgets plus stable `CAREOS_BUDGET_ID`. Restart the server after changing runtime configuration.
4. Initial reviewed endpoint/model: `https://api.openai.com/v1`, `gpt-5.4-mini-2026-03-17`. Other endpoints/models fail closed until their protocol and price bounds are reviewed. The shared provider interface is extensible; compatibility with untested third parties is not claimed.
5. Run the versioned scenarios in `tests/fixtures/careos-evaluation.ts` with a human grounding rubric, adding real provider refusals/errors. Compare source/model/prompt versions, latency, token usage and spend. Fixture results are not live-model evidence.
6. Publish sanitized actual-runtime evidence before claiming live AI or hackathon runtime completion.

Budgets use **integer micro-USD** (1 USD = 1,000,000). Maximum configured caps are $5/day and $25/period; setting them does not constitute spending approval. Before each call, PostgreSQL atomically reserves $0.04 across daily/period buckets and increments call quotas. Supported-model input/schema/output bounds fit that conservative ceiling. Known usage settles at $0.75/M input and $4.50/M output tokens (cached-input discounts ignored conservatively). Missing usage or ambiguous failures retain the full reservation. Never rotate the budget ID to bypass a spent budget. Provider price changes require review before activation.

Each call has its own persisted reservation and original bucket references. Known usage for call two can settle while call one remains unknown. Reverse-order/concurrent settlement is safe; identical replay releases no additional money, changed usage conflicts, and missing buckets roll back every release. UTC rollover does not move the reservation to a new daily bucket. A reported cost exceeding its reservation persists a spending block, not an invented successful settlement. Legacy aggregate unknown usage is not backfilled. History/attention and Glance consume one read-only source-labeled activity projection; partial evidence is explicit and never treated as safety or coverage confirmation.

`store:false` avoids persisted Response application state, not all provider abuse-monitoring retention. No hosted Conversations API or unbounded `previous_response_id` chain is used; each call receives an application-curated bounded context. Native Responses output items are not replayed.

Official references: [Responses structured outputs](https://platform.openai.com/docs/guides/structured-outputs), [JavaScript SDK](https://github.com/openai/openai-node), [model and pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [data controls](https://developers.openai.com/api/docs/guides/your-data), [separate ChatGPT/API billing](https://help.openai.com/en/articles/9039756-billing-settings-in-chatgpt-vs-platform).

## Verification and remaining work

`pnpm careos:evaluate` runs **70 versioned deterministic/fixture tasks** (v2), including scoped recall questions, unsupported replacement categories and unauthorized financial requests. Separate tests validate changed/failed official sources, unsafe citations and exact Twin context. These are reproducible task checks, not hosted-model accuracy or safety certification. The existing Responses adapter is unchanged and remains disabled. [Recall contract](RECALL-GUARDIAN.md) · [replacement contract](REPLACEMENT-CONCIERGE.md) · [merchant scripted framework](INTELLIGENCE.md).

CI runs deterministic/fixture evaluations, injected Responses protocol tests, dedicated PostgreSQL concurrency/budget tests, and browser/accessibility checks in both data modes. No CI secrets can enable paid models or PayPal.

Before submission: owner-approved live model test, human first-time-user task testing, real-device mobile checks and separately approved public hosting. Simulated transport, Chromium mobile emulation and automated axe scans are not live inference, real-device certification or a complete security/accessibility audit.
