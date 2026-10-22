# ADR 0004: Premium Blue & Lavender appearance

**Status:** Accepted implementation direction
**Date:** 2026-10-22
**Scope:** Frontend presentation, appearance preference and regression coverage only.

## Decision

Use blue for commerce/navigation, lavender for explicitly labeled CareOS intelligence, and neutral white/midnight surfaces. A product-passport motif, original theme-aware SVGs and a custom interlocking mark give Pal Care a distinctive identity without copying another brand. Replace serif display typography with locally bundled Geist Sans via the maintained `geist` package.

Use `next-themes` with System as the default and explicit Light/Dark overrides persisted in local storage. Semantic CSS variables drive one component tree. Tailwind v4 uses a class-based dark variant. The root early theme script and hydration-safe selector minimize theme flash without suppressing unrelated hydration errors. Native controls and supported browser theme colors follow the active appearance.

## Constraints

- PostgreSQL, Drizzle, migrations, API routes, provider adapters, payment state, ownership, rate limits and idempotency remain unchanged.
- Appearance changes must not remount checkout controls, issue new financial requests or imply provider approval. Hosted PayPal pages are outside this design system.
- No customer login, Supabase, barcode scanning, AI implementation, sponsor integration or fake financial metrics.
- Planned features and sample/sandbox evidence remain explicit. Unavailable manuals, warranties and safety checks are not represented as verified.
- Known checkout-expiry and buyer-approval issues remain separate work items; no claim that the redesign fixes them.

## Validation

Preserve the financial unit/integration suite and functional browser coverage. Add semantic contrast tests, six viewport/theme projects, theme preference tests, reduced-motion/keyboard/reflow checks and committed fixture-only screenshot references. Run formatting, lint, typecheck, build, database, failure and browser tests; manually inspect representative light/dark desktop/mobile screenshots and verify GitHub Actions before delivery.

See [Design system](../DESIGN.md) for tokens, screen hierarchy and visual references.
