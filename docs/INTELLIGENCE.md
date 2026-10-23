# CareOS merchant intelligence

## Scope and provenance

`/merchant/intelligence` is a public, read-only commerce workspace. Default data comes from the Guardian projection: at most the 500 newest cases. All-record case/verified totals are explicitly separate and never filtered as though they described the detail window. Illustrative scenarios are an explicit separate selection, never inserted into application financial tables. An illustrative completed amount is not a PayPal refund.

Three custom widgets share validated facts: **Value Recovery**, **Adjustment Status**, and **Evidence & Freshness**. Counts and amounts distinguish proposed, approved, provider-pending, unresolved, verified and closed. Case links are application-generated. Zero/empty data is not replaced by invented business activity. No merchant action, financial tool, arbitrary SQL or paid model is exposed.

## Actual AG Studio, local evaluation only

Exact-pinned `ag-studio` / `ag-studio-react` **3.0.0**. Published React peer range includes 19; documented TypeScript minimum is 5.8.3 (application uses 5.9.3). Matched transitive Grid/Charts versions are lockfile-pinned. Loaded dynamically only when opened; customer routes do not import the runtime. No Google Fonts loading. Theme uses the existing light/dark identity.

The real React component hosts the three application widgets, which query the Studio data engine and support cross-filtering. Layout editing changes browser presentation only. Saving/restoring validates the three known widget positions, bounded dimensions and no extra keys. Layout is local to dataset mode; it confers no authorization.

The vendor explicitly permits **local testing without a license**, with its original watermark/warnings intact. Workbench access is limited to local hostnames as a UX guard, not a security boundary or a substitute license. Public deployment is not enabled. No owner account/trial has been activated, no key has been obtained, and coverage through **December 15, 2026** is **not established**. Owner action is needed to obtain an appropriate trial/extension or license before relying on it for public judging. A 45-day trial started in October can expire too soon. Custom widgets do not embed standalone Grid/Charts Enterprise instances requiring separate licenses.

## Verification and future AI

Unit tests cover provenance/window accounting, stage separation, untrusted layouts, scripted commands and rejected planner outputs. Six-project browser checks verify actual widget data/cross-filtering, accessible summary, sample isolation, layout reset, actual scripted harness runs and absence of financial POSTs. The first workspace commit `94c400a` passes exact-SHA CI ([run](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39906192558)).

The actual Studio Agent Framework now runs the explicitly named **CareOS · scripted demo** custom runner. It invokes Studio's built-in schema tool and an SDK-defined `care_dashboard` tool, with at most two calls per run. Six exact prompts filter proposed/pending/verified cases, focus evidence, add one idempotently named verified-only summary, or reset layout. The runner emits real protocol/tool events; displaying an event is not mistaken for executing a tool. Inputs are not natural-language AI interpretation. No model request, raw SQL, arbitrary URL or financial tool is available. Cancellation is checked before actions. A separate `DashboardPlanner` interface accepts only schema-validated commands for future approved inference; its runtime transport/paid endpoint is not activated or claimed implemented.

Scripted assistance and genuine hosted inference remain separate milestones. A future model may use the same bounded presentation vocabulary, never trusted commerce authority. OpenCode development-model access is not runtime model activation.

## Official references

- [Local evaluation permission / license setup](https://www.ag-grid.com/studio/react/licence-install/)
- [Compatibility](https://www.ag-grid.com/studio/react/compatibility/)
- [Custom widgets](https://www.ag-grid.com/studio/react/custom-widgets/)
- [Agent framework](https://www.ag-grid.com/studio/react/ai-agents/)
- [Sponsor guidance](https://paypalaihackathon.devpost.com/details/aggrid)

Source-owned AG Studio packages are commercially licensed; Pal Care's MIT license does not relicense them. Never suppress vendor watermarks, warnings or license checks.
