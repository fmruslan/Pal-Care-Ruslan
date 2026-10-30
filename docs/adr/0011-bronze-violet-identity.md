# ADR 0011: Bronze Pal Care, violet CareOS and slate dark surfaces

**Status:** Owner-approved implementation direction and milestone A isolated visual review; runtime/CI acceptance pending
**Date:** 2026-10-30
**Supersedes:** ADR 0010 appearance identity and typography; preserves its architecture, authorization and acceptance boundaries.

## Decision

Use the owner's supplied written design guide as the palette/typography source of truth, with the supplied images as layout inspiration. Pal Care uses bronze, CareOS violet, verified states green with explicit provenance, and neutrals for ordinary surfaces. Dark mode follows the specified lighter slate palette, not the mockup's near-black background. The new primary slogan is **Everything you own. All cared for.** The same original SVG PC mark appears in the lockup and favicon, violet left and bronze right in both themes.

Keep System default, the existing local appearance preference and one persistent CareOS provider. Self-host the official Inter v4.1 variable font with its OFL; no browser font CDN, font account, new framework or font dependency. Brand hues are not automatically accessible text colors: derive AA text/action/status/control pairs, including a lighter bronze link color on dark slate. The original brand colors stay fixed in the mark. Native AG Studio shares the application font/tokens; vendor notices remain.

## Scope and gates

Milestone A: shared identity/tokens/components, Home/purchase cards and the existing CareOS panel. Cards show existing products, dates, documents and explicit source labels, with details and contextual assistant actions. These actions only open the existing assistant; they do not submit a prompt. Home places purchases before the factual saved-record briefing. No fabricated PayPal connection, account, upload, notifications, notes, warranty monitoring or new product is added.

Primary navigation remains **Home / Purchases / Insights / Documents**, with CareOS as an assistant action, not a new fifth destination. Detail/Documents/Insights page-specific restructuring is milestone B after the owner reviews A; shared styling naturally affects them but is not page-specific acceptance.

Verify in isolated services first. Present desktop/mobile Light/Dark images for owner review before replacing the working private preview. A later refresh requires coordinated stop/build/start and retained credentials/sessions/accounting. No AI inference, approval, policy/grant renewal, migration, financial request or public exposure is part of styling acceptance. Theme switching must never remount checkout or the assistant. Keep unknown work and original drafts/history intact. Exact-commit CI, isolated browser evidence, actual preview and owner feedback remain distinct.
