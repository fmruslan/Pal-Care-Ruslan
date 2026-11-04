# ADR 0013: Care as the default customer experience

**Status:** owner-approved direction; implementation/acceptance tracked separately in [STATUS](../STATUS.md).

Supersedes ADR 0012's two-link navigation presentation only. Preserve its dated Purchase Twins, direct documents, provider-free metadata search, restricted reads and North continuity.

## Decision

- **Care / Purchases / Insights** share a top header and one persistent North coordinator. `/` opens Care at `/dashboard`; the library moves to `/purchases`. `/about` retains the informational landing page.
- Care is a small evidence-backed action feed, not another analytics dashboard. Page loads use deterministic projections, not inference. Cards show exact product/date, status, supporting information and one primary action.
- Existing Guardian evidence remains authoritative for refunds; possible price differences are not savings or eligibility. Missing return/warranty evidence stays unknown. Fictional goods do not acquire real coverage or shipment status.
- Extend North's existing genuine model/tool path with a typed read-only Care task. Preserve original question, server-owned history/anchors, dated identity, original request/attempt accounting and GET-only recovery. No keyword-router replacement, new model framework or financial tool.
- Durable return/warranty/watch data needs separate exact migration/write/worker approval. Public demo visibility and North authentication do not grant it. Draft preparation is not sending or persistence.

## Acceptance

Follow [the approved plan](../CARE-HOMEPAGE-PLAN.md): first complete finding → exact product/source → North → previous result, then finish supported workflows and integrated browser/database/accessibility/native/AI checks. Require clean exact-commit CI, retained verified rollback and actual private 8444 smoke before release. No approval/plan document itself marks a feature shipped.
