# Pal Care design baseline — Bronze / Violet

Owner approved direction and isolated milestone A visual review: [ADR 0011](../adr/0011-bronze-violet-identity.md). Milestone A is **not yet deployed**; actual preview and exact-commit CI acceptance are separate gates. [STATUS](../STATUS.md) is implementation truth.

**Pal Care — Everything you own. All cared for.** A calm personal home for saved purchases, with CareOS close to the relevant records. Do not imply universal purchase import or ownership verification from this slogan.

## Semantic palette

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F8F9FC` | `#1D2630` |
| Sidebar | `#FFFFFF` | `#303C47` |
| Card | `#FFFFFF` | `#45525F` |
| Raised surface | `#F1F3F6` | `#53616E` |
| Product art surface | `#EEF1F4` | `#AAB4BE` |
| Main text | `#172336` | `#FFFFFF` |
| Secondary text | `#56667A` | `#D9E2E8` |
| Primary action / text | `#A45F2B` / white | `#C98244` / `#1C2530` |
| Primary link text | `#8B4E22` | `#F0BB83` |
| CareOS action / text | `#6F57CD` / white | `#A9A1FF` / `#1C2530` |
| CareOS text / surface | `#6247BE` / `#F3F1FC` | `#D0CAFF` / `#464563` |
| Verified text / surface | `#18683E` / `#E9F7EE` | `#B9F4CF` / `#334F44` |
| Decorative border | `#E1E6EB` | `#697786` |
| Input boundary | `#7B8794` | `#B6C2CE` |

**Owner refinements, 2026-10-30:** the initial `#35414C` canvas was first lowered to `#2C3742`, which the owner found too subtle on the actual site. The revised canvas is visibly darker charcoal **`#1D2630`**. Card, sidebar, raised/product-art surfaces and Bronze/Violet accents are unchanged. Neutral surfaces explicitly using the shared canvas token (including the composer input) follow the canvas; this grants no permission and does not change appearance persistence.

Fixed logo hues: bronze **#B8733A**, violet **#8078E5**. Verified accent **#2E9F61** is not white-on-green badge text: use the accessible success pairs above. Explicit Sample / Verified Sandbox labels convey status; no color alone establishes provenance, safety or coverage. Button labels need ≥4.5:1; controls/focus indicators ≥3:1 against adjacent surfaces. Decorative card borders are not control boundaries.

## Type, structure and components

- Inter v4.1 variable font, local `next/font/local`; 16px body/mobile inputs, 1.5 line height; responsive 26–32px page headings and 20–22px section headings, bold. Keep text scalable and metadata readable.
- Official font source: `rsms/inter` release tag `v4.1`, `docs/font-files/InterVariable.woff2`. SHA-256: `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3`. [OFL](../../public/licenses/inter-OFL.txt); no Google Fonts runtime request. Existing Geist assets/license remain historical and are not deleted.
- PC icon: transparent original vector, uppercase geometric P/C, two-tone frame with 18/96 corner radius, no glow/heart/payment ornament. Same asset used for favicon and lockup; foreground label is **Pal Care**.
- Four-pixel spacing base; 16–24px card padding, 16px cards, 12px controls; desktop sidebar 224px. Neutral image surfaces, restrained shadows, no decorative ring around each product. Original product illustrations are retained rather than introducing unlicensed/generated inventory.
- Purchase cards: readable product/date/amount-or-reference/document data and explicit provenance, details link and contextual CareOS action. Three/two/one columns at responsive widths. No Add purchase action until that capability is separately approved/implemented.
- CareOS: violet sparkle/actions/prompts/focus; neutral response and input surfaces. One persistent assistant and existing source/context/error/recovery controls. Opening from a card selects its existing context but never sends automatically. Preserve drafts, history, unknown-request reconciliation, authorization and accounting. UI colors never grant AI access.
- Keep native AG Studio grid/chart/KPI and exact cross-filter/layout behavior. A shared theme/font change does not constitute acceptance of new analytics features or licensing.
- No fake account photos, connection status, notifications, document creation or active monitoring from the reference image. Unavailable features stay unavailable. Appearance never creates transactions or remounts checkout.

## Verification / delivery

Run contrast/unit, theme persistence, keyboard/reduced-motion/reflow, card-context/no-turn, CareOS recovery and native Studio regression checks. Deliberately review new fixture/database screenshots separately, keep existing thresholds, and require exact-commit CI. Isolated captures are not the actual private preview, owner approval, live AI proof or real-device certification. Present milestone A for review before the coordinated preview refresh; milestone B follows demonstrated visual acceptance, not dates or feature counts.
