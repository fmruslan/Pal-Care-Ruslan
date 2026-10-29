# ADR 0010: Blue platform, saffron CareOS and deep-purple care

**Status:** Owner-approved implementation direction; visual acceptance pending
**Date:** 2026-10-29
**Scope:** Shared appearance and Home/Insights review checkpoint
**Supersedes:** ADR 0004's lavender CareOS color assignment and standard card sizing only. Its architecture, local appearance preference and financial-safety constraints remain in force.

## Decision

Blue identifies Pal Care navigation and ordinary actions. Warm saffron identifies CareOS assistance, with dark text on filled amber buttons and readable brown text on light cream. Deep purple supports product-care content, distinct from CareOS identity. Neutral surfaces dominate; original product artwork and the Purchase Twin passport motif remain.

Use semantic System/Light/Dark CSS tokens, 16px standard cards, 12px nested surfaces, compact headings and reduced-motion-aware interactions. Keep next-themes and the existing browser-local appearance key. Both customer and secondary merchant native AG Studio use the same CSS color roles instead of independent hex palettes. Vendor notices remain intact.

Home gives factual saved-record suggestions and purchases a compact hierarchy. Insights opens its existing native workspace directly when the unchanged evaluation/configuration gate permits. Its three loaded-window totals and deterministic suggestions are explicitly separate from the native filtered selection. Accessible evidence records and unavailable-license states remain available. Search and provenance buttons feed the existing validated selection path; native sorting, cross-filters and local layout behavior remain.

## Boundaries and acceptance

No new framework/dependency, database migration, API endpoint, purchase mutation, model request, provider activation or public deployment. Original snapshots, receipts, policy evidence, payment identities and authorization/accounting remain unchanged. Appearance is not authority and never remounts checkout. Original artwork is reused; external references are inspiration, not copied assets or supported capability claims.

The first delivery is Home + Insights plus shared components. Review both themes on desktop/mobile before extending page-specific redesign work to the remaining customer routes. Shared tokens naturally affect those existing routes; that is not a claim of completed page-specific redesign or customer acceptance. Tests, actual private-preview observations, exact-commit CI and human/real-device approval are reported separately in STATUS and the refresh evidence ledger.
