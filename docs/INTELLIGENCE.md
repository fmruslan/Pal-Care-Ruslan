# CareOS merchant intelligence

## Scope and provenance

`/merchant/intelligence` is a public, read-only commerce workspace. Default data comes from the Guardian projection: at most the 500 newest cases. All-record case/verified totals are explicitly separate and never filtered as though they described the detail window. Illustrative scenarios are an explicit separate selection, never inserted into application financial tables. An illustrative completed amount is not a PayPal refund.

Three widgets share validated facts: **Value Recovery**, **Adjustment Status**, **Evidence & Freshness**. Counts distinguish proposed/approved/provider-pending/unresolved/verified/closed. Empty records never become illustrations. No financial tools, arbitrary SQL/URLs or merchant mutation. Sol Medium subscription planning and actual browser tool execution are now privately verified; paid API/public licensing remain separate. [Actual results](evidence/SUBSCRIPTION-QUALITY.md).

When the optional Studio workbench opens, the semantic summary is available through an accessible disclosure rather than stacking two full dashboards on a mobile screen. Dataset/provenance/filter-scope labels stay visible. Closing the workbench reopens the summary. This presentation preference grants no commerce authority and does not remount checkout.

## Actual AG Studio, local evaluation only

Current evaluation gate additionally requires **`AG_STUDIO_LOCAL_EVALUATION_ENABLED=true`**, exact local `APP_ORIGIN` and matching request Host. Host alone cannot enable it. Default is off. For example, `APP_ORIGIN=http://localhost:3000 AG_STUDIO_LOCAL_EVALUATION_ENABLED=true pnpm dev` enables permitted local evaluation, not public deployment. The initial mobile layout stacks custom widgets; saved layout remains presentation only.

Exact-pinned `ag-studio` / `ag-studio-react` **3.0.0**. Published React peer range includes 19; documented TypeScript minimum is 5.8.3 (application uses 5.9.3). Matched transitive Grid/Charts versions are lockfile-pinned. Loaded dynamically only when opened; customer routes do not import the runtime. No Google Fonts loading. Theme uses the existing light/dark identity.

The real React component hosts the three application widgets, which query the Studio data engine. Stage controls now share one application-owned page selection translated through immutable Studio state APIs; independent hidden stage cross-filters no longer intersect an already filtered input dataset. Widget-specific verified summaries further restrict the page selection, while labeled all-record totals remain unfiltered. Layout editing changes browser presentation only. Saving/restoring validates the three known widget positions, bounded dimensions and no extra keys. Layout is local to dataset mode; it confers no authorization.

The vendor explicitly permits **local testing without a license**, with its original watermark/warnings intact. Workbench access is limited to local hostnames as a UX guard, not a security boundary or a substitute license. Public deployment is not enabled. No owner account/trial has been activated, no key has been obtained, and coverage through **December 15, 2026** is **not established**. Owner action is needed to obtain an appropriate trial/extension or license before relying on it for public judging. A 45-day trial started in October can expire too soon. Custom widgets do not embed standalone Grid/Charts Enterprise instances requiring separate licenses.

## Scripted and Sol model-driven modes

For public acceptance, request a trial/extension covering the actual feature set (the runtime identifies **AG Studio Pro with AI** when the Agent Framework module is enabled) through the full judging period. Local unlocked evaluation does not prove licensed public use. Owner-provided coverage and deployment-gate wiring remain required; no key/account/trial was activated here.

Unit tests cover provenance/window accounting, stage separation, untrusted layouts, scripted commands and rejected planner outputs. Six-project browser checks verify actual widget data/cross-filtering, accessible summary, sample isolation, layout reset, actual scripted harness runs and absence of financial POSTs. The first workspace commit `94c400a` passes exact-SHA CI ([run](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39906192558)).

Default **CareOS · scripted demo** remains labeled and uses six exact prompts, real schema/presentation tools and at most two tool executions; it is not natural-language inference. New **CareOS · Sol Medium** uses a server-side Responses planner and the same actual Studio custom runner. A strict plan allows up to three unique known commands (filter proposed/pending/verified, add idempotent verified-only summary, focus evidence, reset), plus one real SDK schema tool. Each allowed tool is executed and its result checked, not merely emitted as an event. Unknown keys/commands, empty apply plans and consequential requests are rejected before execution; cancellation stops remaining tools (already-applied browser changes are not financial effects). No autonomous tool loop.

`POST /api/intelligence/plan` checks exact Origin, local Studio enablement, live config, separate expiring capability and persistent ownership/fingerprints. It reads fixed recorded or labeled illustrative aggregates, never client financial facts/tools. Customer/Studio share Sol/medium but separate scopes/context; subscription mode uses the shared host request/token allowance, while the deferred API mode retains its atomic dollar budget. Cancellation/failure saves an unavailable terminal turn; replay never redispatches and a new request can proceed. No commerce authority. [Private subscription contract](SUBSCRIPTION-DEVELOPMENT.md).

Injected browser tests remain separate from actual subscription evidence: genuine Sol plans changed the pending filter, added a verified-only summary/evidence view, reset widgets and correctly kept actual recorded data empty/zero. Combined visibility currently uses **All stages plus a verified-only summary**, not a two-stage union. Subscription UI says **Using ChatGPT plan** rather than an API-dollar budget. Public licensing and paid API acceptance remain incomplete. OpenCode model access is never runtime authorization.

## Official references

- [Local evaluation permission / license setup](https://www.ag-grid.com/studio/react/licence-install/)
- [Compatibility](https://www.ag-grid.com/studio/react/compatibility/)
- [Custom widgets](https://www.ag-grid.com/studio/react/custom-widgets/)
- [Agent framework](https://www.ag-grid.com/studio/react/ai-agents/)
- [Sponsor guidance](https://paypalaihackathon.devpost.com/details/aggrid)

Source-owned AG Studio packages are commercially licensed; Pal Care's MIT license does not relicense them. Never suppress vendor watermarks, warnings or license checks.
