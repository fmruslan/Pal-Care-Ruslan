# ADR 0012: Product-first Home and two-link customer header

**Status:** Owner-approved implementation and automatic private-deployment direction; acceptance evidence in [STATUS](../STATUS.md).
**Date:** 2026-11-03
**Supersedes:** ADR 0011's four-link navigation requirement only. Bronze/violet/slate identity, architecture, source integrity and authorization remain unchanged.

## Decision

Use **Home / Insights** as visible customer header links; remove the permanent customer sidebar and bottom navigation bar. Home is the saved-purchase library with provider-free product/document metadata search and a prominent All documents view. Preserve one card/detail per dated Purchase Twin, original document URLs/downloads and original purchase/source evidence.

`/dashboard` is canonical; `/dashboard?view=documents` is the document-library view. `/vault` and `/documents` are temporary compatibility redirects preserving validated supported query state. Individual `/vault/[id]`, `/vault/[id]/care`, `/documents/[id]` and download URLs remain. Product pages expose Overview / Documents / Care & History as jump links to visible sections, not hidden tabs.

Use the existing bounded fixed-fictional saved-library read and source validation, with explicit coverage and result pagination. Search products, brands, models and document titles/kinds; do not invoke a model, search document bodies or invent missing manuals. Purchase-source filters apply to parent purchases, never promote attached sample policy documents to verified evidence.

Keep one root North host, histories/drafts/pinned context, recovery identities and existing live AI authorization/accounting. Presentation navigation/search never sends a question. Insights retains all three named views and native grid/chart/KPI, cross-filters and layouts. Merchant navigation is unchanged.

## Delivery authority and acceptance

The owner authorizes complete implementation, relevant unit/dedicated-DB/browser/accessibility/regression verification, commit/push, exact-commit CI, rollback preparation, automatic private **8444 → 3002** replacement and actual HTTPS smoke checks. Roll back application assets/configuration automatically on a critical regression, never records/credentials/accounting. No additional routine approval is required. The separate 200-case campaign is not a prerequisite; focused North continuity/function checks are.

No public exposure, financial operation, application migration/credential provisioning, vendor-license activation, AI allowance/reset/renewal or paid fallback is added. Owner review follows deployment; automated/mobile-emulated evidence is not real-device or independent-user acceptance. [Approved plan and research](../HOME-LIBRARY-UX-PLAN.md).
