# Continuation verification ledger

## Boundaries

No new actual PayPal purchase/refund, hosted-model call, paid subscription, trial signup, paid infrastructure or cloud deployment. Existing Stage 2/4 evidence remains distinct. New features do not complete the pending actual refund/AI acceptance gates.

## Completed checkpoints

| Increment | Evidence |
| --- | --- |
| Merchant data foundation + actual Studio widgets | `94c400a`: lint/typecheck/build, 218 unit, 88 dedicated PostgreSQL, 6 actual-widget browser projects; [exact-SHA CI passed](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39906192558) |
| Scripted actual Studio Agent Framework | Six-project local schema/tool/filter/reset flow passed. `4b7929c` CI stopped on formatting; corrected by `0fe701b`, whose [exact-SHA CI passed](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39908119897). The failure was corrected, not treated as provider proof |
| Recall/Channel3/CareOS checkpoint | Lint/typecheck/build and **257 unit tests** pass; all **96 dedicated PostgreSQL tests** pass (88 existing + 3 CPSC + 5 discovery). A final focused 5/5 discovery rerun verifies a real temporary restricted login, denied checkout UPDATE, and rejection of owner-authenticated `SET ROLE` narrowing. Test credentials are runtime-generated and the role is revoked/dropped; no permanent app/provider credential configured |
| Browser and visual checkpoint | **330 fixture + 330 database checks pass** with original screenshot references unchanged. Later focused mobile stacking exposed a touch-interception regression; explicit vendor canvas min-width/scroll containment corrected it. The final actual-Studio flow passes **6/6** projects, including mobile touch filtering, scripted commands and duplicate-summary prevention, with no forced clicks or relaxed assertions |
| Financial-preservation browser and outage checkpoint | Exclusive injected Guardian flow **6/6** passes after aftercare integration, including mobile duplicate-CTA regression. Production-server outage test **1/1** passes. Synthetic refund is test-DB-only, not provider evidence |
| Versioned CareOS evaluations | v2: **70/70**, zero model/financial calls. Deterministic/fixture outcomes are not live-model accuracy |
| Real official CPSC evidence | `cpsc:verify` and one local `cpsc:refresh` validate recall 24159/API ID 9892, matching pinned hash; official HTML page separately reviewed. [Source/evidence](../RECALL-GUARDIAN.md) |
| Application database preservation | Reviewed migrations 0010–0012 applied with every row in **all 23 pre-existing public tables unchanged**. No seed, new synthetic purchase/refund, price change or grant. New CPSC source/assessment lives in separate tables |
| Final integrity check | Idempotent reviewed migration check preserves all rows across **28 current public tables**, including the saved CPSC evidence. Frozen install, formatting, repository/diff validation and production audit pass (no known vulnerabilities reported; not certification). Original commerce services/schema have no source changes |

Provider-double tests and synthetic screenshots are not PayPal/Channel3/hosted-model evidence. Browser tests use production builds, desktop/tablet/mobile Chromium and both themes; emulation is not a real-device usability study. Automated accessibility/security checks are not independent certification.

Representative desktop/mobile light/dark merchant/recall/replacement screenshots were inspected, including the actual stacked mobile Studio canvas. The final exact-SHA Actions run is verified and linked at delivery. Intermediate CI formatting and mobile-regression failures above were corrected rather than represented as passing runs. One local combined command exceeded its shell timeout while multiple browser suites were running; the subsequent standalone complete quality run passes.

The aftercare release `40f55d3` passes [exact-SHA CI](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/39911494677), including 330 browser checks in each data mode, evaluations, migrations, and the exclusive injected Guardian flow. The subsequent session-user credential-boundary hardening has its own exact-SHA run checked at final delivery.

## Pending external gates

- Actual Sandbox refund and optional unknown-ID recovery fields: separate financial approval.
- Genuine CareOS inference: separately approved API credentials, restricted writer, budgets and actual evaluation.
- Genuine model-driven Studio dashboard interaction: planner transport/runtime still needs approved implementation/activation and real-provider evaluation; the current runner is explicitly scripted.
- AG Studio public/judging use: owner license/trial/extension covering the full judging period through December 15; local evaluation is permitted without a key, with vendor notices retained.
- Channel3: owner account/key and confirmed free credits, then bounded actual API verification. Fixture infrastructure does not establish sponsor qualification.
- Public hosting and demo video: not deployed/recorded. Reproducible local setup remains available; no claim of top-three placement or measured business impact.
