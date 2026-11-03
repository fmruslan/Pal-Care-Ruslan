# North ☆ owner preview diagnosis and correction — 2026-11-03

**Historical interface-only checkpoint:** owner subsequently supplied real parser-failure screenshots and explicitly approved live AI on 8445. [Current conversational correction, actual model/browser evidence and build](NORTH-CONVERSATIONAL-AI.md) supersedes this report's AI-off configuration and current-build label, not its retained observations or original 8444 preservation.

## Implemented

**Review URL: https://greatbison.tail9e8802.ts.net:8445/dashboard**. Connect to Tailscale; no separate application login. Gate C/customer outcome: start with the saved library, optionally choose a product, and complete linked search → total → native chart in one conversation. Owner explicitly authorized fixing/restarting only this isolated preview, not 8444 or AI activation.

North's initial context now reads **All saved purchases / Choosing a product is optional**, replacing ambiguous “No purchase selected.” The visible review banner identifies **:8445** and its actual build; “Running source identity” shows baseline/working-change disclosure and source SHA-256. The launcher passes only validated public build metadata after existing snapshot verification. No grants, credentials or executable authority derive from these labels.

### Findings before correction — not a guessed stale-cache diagnosis

At **2026-11-03T17:31:30.853Z**:

- Tailscale Serve was correctly configured **8445 → 127.0.0.1:3003**. PID **3243626** ran Next.js 16.4.2 from `/tmp/opencode/palcare-north-owner-review/app`, build `kJgAa5LQohScrVu7Y-SH5`, baseline `1efd0e7` + review changes. Every manifest source hash matched; primary `src/`/`public/` matched that snapshot.
- A real HTTPS browser already displayed **North ☆**, no “Powered by CareOS,” editable question-first input, and **five linked records for “what have I bought” without an individual-purchase picker**. Therefore disabled AI was not preventing that library query in the observed review runtime.
- The unchanged **8444** HTML contains the old CareOS attribution and no North. That matches the described old-interface symptoms, but **does not establish which URL/assets the owner's browser displayed**. No screenshot attachment/browser trace from that device was available in this request. Wrong URL, stale tab, browser cache or a device-specific path remain unproved; none is asserted as the root cause.
- 8445's HTML was already `private, no-cache, no-store, max-age=0, must-revalidate`; no service worker was registered in the fresh test browser. A different browser cannot certify the owner's cache state.

The confirmed problem we changed was confusing default-scope copy and missing visible deployment identity. We did **not** claim to repair an observed stale server, rotate authorization, clear owner storage or rebuild 8444. The old review snapshot and its operational records remain intact.

## Verified

### Exact running process/source/build

| Identity | Observed value |
| --- | --- |
| HTTPS → loopback | `https://greatbison.tail9e8802.ts.net:8445` → `127.0.0.1:3003` |
| Service / Next PID | `palcare-north-review.service` / **3269229** |
| Snapshot cwd | `/tmp/opencode/palcare-north-owner-review/app-library-first` |
| Commit baseline | **`1efd0e77040a7ae0a1aad190d5d47320ce1c941a` + uncommitted working changes** |
| Runtime source SHA-256 | **`b20994b715f30f72f2e4e0ca55716e1fd4c4e15552b035df089917b734086a96`** |
| Next.js build | **`yO4tITCett20kBtsK06c9`** |
| Build time | **`2026-11-03T17:35:40.860Z`** |

This is not described as a clean commit or new exact-commit CI result. Baseline [CI 41588069405](https://github.com/fmruslan/Pal-Care-Ruslan/actions/runs/41588069405) remains separate. Packaging preserved original external-dependency symlinks; the active snapshot was never rebuilt in place.

### Isolated verification

Full lint, typecheck, **1,277 units / 65 files**, production build pass. **8/8 focused desktop-Light/mobile-Dark regressions** pass for first-open discovery, optional context/picker cancellation/removal and the exact reported library question. New unit coverage checks fresh library scope despite prior product/category context; build metadata cannot inherit invented source-environment labels.

The initial browser run had **six passes / two new-test guard failures**: fixture-mode open initializes an empty care conversation (`POST /api/careos/conversations`), which the overly strict test misidentified as inference. The corrected test permits **only the empty bootstrap**, still denies care/model turns, and retains every result/link/no-picker assertion. Original logs/traces are retained, not erased or called product passes. No runtime fix/rebuild was needed for that test-only correction.

### Actual HTTPS browser observations

At **2026-11-03T17:39:04.698Z**, desktop/mobile × Light/Dark **4/4 profiles pass** against the actual Tailscale URL:

| Task | Actual result |
| --- | --- |
| First open | North ☆ header, no old attribution, **All saved purchases**, optional product selection, editable composer |
| `what have I bought` | Five saved records; deterministic library outcome, no picker |
| `Show my sample purchases` → `Put those in a list` | Four Sample records, exact Twin/receipt links, bullets; actual headphone link navigates to its intended Twin |
| `Total?` | **$307.00**, three priced Samples, one unpriced reference excluded; Sandbox remains separate |
| `Show that by category as a chart` | Actual native SDK execution/read-back and rendered **two-series** chart; Audio $218 / Kitchen $89, Sample/Sandbox split |
| Previous-month comparison | Saved previous-period evidence rendered; no invented prior records |
| Navigation / reload | Conversation and unsent draft restored without mutation replay |
| Product-specific care | Exact Pi context/source page and official shutdown guidance; conversational-care Send disabled honestly |
| AI boundary | Pairing **403**, no cookie issuance; no model/financial/external attempts or page errors |
| Source/asset identity | **13/13 loaded JavaScript assets per profile** byte-hash match the running snapshot; visible build marker matches manifest |
| Normal cache behavior | Routing removed for ordinary-cache navigation/reload: North and the same build persist; no service worker registered in these test browsers |

All data is fixed fictional demo data with distinct Sample/existing genuinely verified Sandbox provenance. No purchase/refund was created or synthetic capture seeded. Original-cookie sentinels remain unchanged; review cookie Secure/HttpOnly/Strict. Care and semantic/model planning remain unavailable without separately authorized live inference. Vendor watermark/notices remain; no trial/license activation or public licensing claim.

### Fresh screenshots from the HTTPS preview

All twelve were captured on this build and visually reviewed. Mobile is Chromium emulation at device pixel ratio, not a real-device test; images are unretouched. [Capture identity and SHA-256 manifest](north-owner-review/screenshots.json).

| Profile | First open / optional scope | Linked results and total | Native chart |
| --- | --- | --- | --- |
| Desktop Light | [Open](north-owner-review/desktop-light-open.png) | [Results / $307](north-owner-review/desktop-light-records.png) | [Chart](north-owner-review/desktop-light-native-chart.png) |
| Desktop Dark | [Open](north-owner-review/desktop-dark-open.png) | [Results / $307](north-owner-review/desktop-dark-records.png) | [Chart](north-owner-review/desktop-dark-native-chart.png) |
| Mobile Light | [Open](north-owner-review/mobile-light-open.png) | [Results / $307](north-owner-review/mobile-light-records.png) | [Chart](north-owner-review/mobile-light-native-chart.png) |
| Mobile Dark | [Open](north-owner-review/mobile-dark-open.png) | [Results / $307](north-owner-review/mobile-dark-records.png) | [Chart](north-owner-review/mobile-dark-native-chart.png) |

### Preservation

At **2026-11-03T17:39:12.360620Z**, original `.env.local`, primary `.next` metadata/BUILD_ID, owner accounting file, original preview PID **2510002**, **all Serve routes** and Funnel-off state match the before-receipt. New runtime is disabled-AI/financial-off with no admin/model/payment secrets injected. No migration/seed, provider call, grant migration, allowance reset, license activation or public exposure. The six-case campaign was not resumed.

Private proof: `/tmp/opencode/palcare-north-owner-review/urgent-review/` contains before/diagnosis/preservation receipts, full check/build logs, initial/corrected focused-browser logs, actual HTTPS smoke results with script-asset hashes, screenshots, and previous launcher/manifest. The new service uses the separately packaged snapshot and installed production dependencies; leave its assets untouched while serving.

## Incomplete

Owner-device confirmation and the cause of the owner's reported old screen; real-device/keyboard/IME review; new exact-commit CI. Full genuine campaign remains **6/200 / four strict passes**, with both failures and original unknown retained. This fix does not accept the complete makeover or satisfy all gate C/D criteria.

## Blocked

No exact-origin live AI grant for 8445. Arbitrary semantic interpretation, model-planned actions and conversational care require an active separately authorized model scope; saved searches, computed records, native saved-analysis charts, history and saved care pages do not. Existing campaign capacity/authorization limits remain unchanged; no new operation is activated.

## Next

Open the exact review URL and confirm **Review :8445 · Build yO4tITCett20kBtsK06c9** before testing. Try `Show my sample purchases` → `Put those in a list` → `Total?` → `Show that by category as a chart`. No permission change is needed for this saved-record review. Owner feedback is the next gate C evidence, not an automatic request to renew AI authority or replace 8444.
