# Pal Care — Blue & Lavender design system

## Product direction

Stage 4 Guardian screens reuse these semantic surfaces and original Blue/Lavender identity. Proactive briefing, opportunity/evidence cards and Twin history distinguish proposed, approved, pending/unresolved and provider-verified states without turning the customer experience into a claims form. The expandable price illustration is explicitly non-entitlement sample content. Desktop-light/mobile-dark synthetic opportunity views were inspected; six-project axe/browser flow passes. No actual-provider refund screenshot exists yet; ignored synthetic test artifacts are not financial evidence.

Pal Care is a purchase companion, not an administrative ledger. The signature object is the **Purchase Twin**: a digital product passport that brings identity, purchase evidence, documents and care history together. The visual language uses an original interlocking P mark, layered passport frames, restrained orbital illustration details and a perforated document divider. No third-party logos or proprietary artwork are copied.

Blue represents commerce and navigation. Lavender represents planned CareOS intelligence. Neutral surfaces provide breathing room. Neither a purple accent nor a polished panel implies that an AI service is connected.

## Semantic colors

Colors live in `src/app/globals.css`; components use semantic tokens rather than separate light/dark implementations.

| Role | Light | Dark |
| --- | --- | --- |
| Page / card | `#FAFBFF` / `#FFFFFF` | `#0B1020` / `#121A2B` |
| Main text | `#172033` | `#F3F6FF` |
| Secondary text | `#59667E` | `#A9B5D0` |
| Primary action / text on action | `#3157B7` / white | `#90AFFF` / `#0B1020` |
| Brand accent | `#4F7DF3` | `#90AFFF` |
| Secondary surface / text | `#EAF1FF` / `#3157B7` | `#1A2540` / `#AFC4FF` |
| Intelligence surface / text | `#F5F1FF` / `#7354B3` | `#292342` / `#DDD2FF` |
| Lavender illustration accent | `#AD9AF7` | `#C4B5FD` |
| Decorative border | `#E2E8F3` | `#2D3954` |
| Control boundary | `#7C89A3` | `#7182A4` |

Success, warning and error use separate foreground/surface pairs, always accompanied by text and/or an icon. Sample provenance is neutral; a verified-sandbox badge means payment evidence, not insurance, warranty coverage, recall safety or AI confidence.

White on the requested brand blue is only about 3.78:1, so normal-text light-mode primary buttons use the deeper blue (about 6.61:1). Dark primary buttons use navy text on pale blue. Unit tests enforce 4.5:1 for ten semantic text pairs per theme and 3:1 for input/focus indicators against page/card surfaces. Automated axe scans also inspect rendered pages; this is not a full accessibility certification.

## Typography and components

- Geist Sans comes from the exact-pinned maintained `geist` package (`geist/font/sans`). It supplies local font assets through Next.js font optimization, not a custom font pipeline or browser request to Google Fonts. Its copyright and SIL Open Font License are retained in [`public/licenses/geist-OFL.txt`](../public/licenses/geist-OFL.txt), served with the app.
- Body text is 16px; meaningful secondary information is generally 14px. Compact metadata is 12px. Headings use the same sans-serif family with a consistent responsive scale and tighter tracking.
- Standard cards use a 24px radius, controls 12px, passport frames 28px. Spacing follows Tailwind's shared scale rather than per-page arbitrary margins.
- Shared components: `PageHeading`, `Badge`, `PurchaseBadge`, `ProductArt`, `CareOSPanel`, `StandaloneShell`, theme selector, buttons, cards and inputs.
- Product illustrations are original inline SVGs with theme tokens for body, edge, highlight and shadow. They remain decorative; product identity is available as text.
- Gradients are restrained and static. Hover movement is limited to a three-pixel card lift; reduced-motion preferences disable transitions and animation.

## Appearance behavior

### CareOS Stage 3

CareOS is assistant-first: a two-item factual briefing and direct receipt/guide links provide value without typing. A single root host follows customer navigation. Desktop is an expandable nonmodal side panel; mobile/tablet use a modal bottom sheet with safe-area padding, explicit close/expand controls and keyboard/focus restoration. It never auto-opens or forces answer autoscrolling. One global launcher avoids duplicate dashboard chat buttons. Tap results omit redundant prompt bubbles; a compact composer leaves more room for useful guidance. Context, sample/Sandbox provenance, execution mode and expandable evidence remain visible. Dismissed suggestions are browser-local, not purchase mutations. The verified fictional Forma F-01 never borrows the reference product's guide.

`next-themes` is wired once at the root. Default preference is **System**. Light/Dark overrides persist in local storage under `palcare-appearance`; selecting System restores live `prefers-color-scheme` following. Theme selection never uses a payment cookie or API call.

The package's early theme script sets the HTML class before page content. The selector reserves its layout and waits for client mounting before reflecting stored preference; only root-attribute hydration differences are suppressed. Browser `theme-color` and native `color-scheme` follow the resolved appearance. Storage failures fall back gracefully to System; no universal no-flash guarantee is claimed for blocked scripts/storage or every browser environment.

## Navigation and screen hierarchy

Continuation preserves the passport identity and paperwork hierarchy. The merchant workspace adds three evidence-led summary/custom-widget views, explicit sample/recorded selectors, browser-local layout tools and a visibly scripted assistant. Recall evidence and replacement profiles use existing semantic cards, conditional provenance and readable source limits. A redundant mobile Guardian-page Ask action is hidden because the existing global launcher remains available; no checkout or financial behavior changes. Vendor workbench default minimum width/scroll containment is explicitly tested rather than assuming a desktop canvas fits a phone. No third-party watermark or license notice is hidden.

- Desktop: persistent sidebar, readable breadcrumb, appearance selector and Customer/Merchant workspace switch.
- Mobile/tablet: customer destinations are Home/Vault/Documents/Shop; merchant destinations are Merchant/Intelligence. Both use safe-area padding and an explicit workspace switch. No horizontally scrolling navigation.
- Dashboard: welcome, compact factual counts and Purchase Twins first, then source-labeled events and planned care features. The large promotional hero belongs on the homepage, not above a returning customer's purchases.
- Purchase Twin: passport identity and evidence summary first; paperwork/history and planned intelligence form the second level. Missing manuals/warranties and unverified recall/return status are stated explicitly.
- Merchant: accessible inventory/document views plus a separate evidence-led intelligence workspace, actual AG Studio local evaluation and visibly scripted presentation tools. Public licensing and hosted AI are not implied by polish.
- Checkout: styled within Pal Care only. Approval/capture/retry/cancellation handlers, initial effects, ownership, deadlines and financial authorization are unchanged. No attempt is made to restyle PayPal's hosted UI.

Stage 5 keeps these tokens and identity. Safety/replacement links carry a saved Twin or explicit reference example; the assistant remains available without inventing ownership. Unified activity is scoped to the selected Twin on detail pages and aggregates labeled sources on the dashboard. Opening Studio collapses the duplicate semantic summary into an accessible disclosure; filter/provenance labels remain visible and the summary can be reopened. Screenshots and browser checks are test evidence, not provider verification.

## Visual review and regression references

Thirty fixture-only references are generated by Playwright; no real transaction/customer data or private checkout sessions are captured. Each uses the bundled font and fixed sample ownership data, including the separately attributed reference product.

| View | Light | Dark |
| --- | --- | --- |
| Homepage, desktop | [Image](../tests/e2e/visual/desktop-light/home.png) | [Image](../tests/e2e/visual/desktop-dark/home.png) |
| Passport, desktop | [Image](../tests/e2e/visual/desktop-light/passport.png) | [Image](../tests/e2e/visual/desktop-dark/passport.png) |
| Dashboard, mobile | [Image](../tests/e2e/visual/mobile-light/dashboard.png) | [Image](../tests/e2e/visual/mobile-dark/dashboard.png) |
| Shop, mobile | [Image](../tests/e2e/visual/mobile-light/shop.png) | [Image](../tests/e2e/visual/mobile-dark/shop.png) |
| CareOS, desktop | [Image](../tests/e2e/visual/desktop-light/assistant.png) | [Image](../tests/e2e/visual/desktop-dark/assistant.png) |
| CareOS, mobile | [Image](../tests/e2e/visual/mobile-light/assistant.png) | [Image](../tests/e2e/visual/mobile-dark/assistant.png) |

`playwright.config.ts` covers desktop (1440px), tablet (834px) and mobile (390px), each in light and dark. The suite tests fresh System behavior, live OS changes, manual overrides, reload/navigation persistence, returning to System, hydration/initial-heading theme, storage failure, reduced motion, keyboard access, reflow and checkout POST counts. Four flagship pages plus the open CareOS assistant have screenshot comparisons in all six projects; full-page artifacts are saved separately for manual review. Normal CI compares committed baselines and does **not** update them.

Update visual baselines deliberately with `pnpm test:e2e --update-snapshots`, inspect the resulting images, then commit the approved references. Snapshot tolerance is 0.5% to allow small renderer differences; layout/functional and accessibility assertions run independently.

## Known, separate checkout issues

- The redesign itself did not resolve the earlier buyer/merchant approval rejection. Separate Stage 2 work now has one actual completed USD 129.00 purchase/Twin, while the earlier eCheck remains separately preserved. See [actual-provider evidence](evidence/STAGE2-VERIFICATION.md) and [status](STATUS.md), not appearance, for payment claims.
- The expiry defect was deliberately outside the redesign. The separate Stage 2 follow-up now derives expiry and removes stale approval/capture/retry controls without altering this design or extending old deadlines; [status](STATUS.md) records current verification.
- Redesign tests disable live checkout. Intercepted checkout UI responses and injected service doubles are never described as actual PayPal verification.
