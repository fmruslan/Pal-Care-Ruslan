# Pal Care

**Next integration prepared, not activated:** GPT-6.1 Sol with fixed medium reasoning for cited CareOS guidance/evidence interpretation and validated AG Studio presentation plans. Shared capped accounting, expiring separate scope access and migration **0016** are implemented/tested in isolation; the original database remains at **0015**, with no live model call claimed. [Proposed $5 evaluation, first $0.50 acceptance and API-key setup](docs/AI-EVALUATION.md).

Current testing uses the existing OpenCode development connection plus automated fixture/injected tests. No API key/billing or 0016 activation now; actual capped API acceptance is reserved for final integration. `pnpm careos:review --examples` provides the [offline prompt/answer review pack and its evidence limits](docs/evidence/OFFLINE-AI-REVIEW.md). OpenCode authentication is never a website credential.

**Local security cutover passed:** verified Phase A recovery/Mac backup, migrations through 0015 and actual restricted reader/CareOS connections. The private app runs on loopback with fixture assistance and financial/provider activation off. Linux OS isolation and public deployment remain blocked; see [Phase B evidence](docs/evidence/PHASEB-CUTOVER.md) and the [completed checklist](docs/DATABASE-CUTOVER.md).

Stage 5 hardening connects existing journeys and removes privileged database fallbacks. The separately approved Phase B cutover verified the existing local application with migrations through **0015**, a restricted reader and a separate CareOS writer. This is not public-runtime isolation or provider acceptance. See [historical Stage 5 evidence](docs/evidence/STAGE5-VERIFICATION.md) and [current setup](docs/SETUP.md). No provider activation is authorized.

Webhooks are not yet implemented; actual Stage 4 refund verification still needs separate approval. Merchant intelligence uses actual AG Studio local evaluation and a clearly scripted Agent Framework. Recall Guardian uses one reviewed official CPSC notice; replacement discovery remains fixture-based until Channel3 verification. Public license coverage and hosted AI remain unverified.

**Everything you buy. Taken care of.**  
*Powered by CareOS · Independent PayPal AI Hackathon project*

> **Price Guardian remains financially disabled pending separate actual-refund acceptance.** The continuation adds real local AG Studio widgets/scripted SDK tools, genuinely retrieved historical CPSC evidence, and a care-first replacement experience with disabled Channel3 API infrastructure. Existing purchases and Guardian records are preserved. Scripted/fixture assistance is not live AI; public licensing, actual Channel3, genuine runtime inference, webhooks and deployment remain incomplete. [Current status](docs/STATUS.md) · [continuation evidence](docs/evidence/CONTINUATION-VERIFICATION.md) · [Price Guardian](docs/PRICE-GUARDIAN.md).

Pal Care explores a new reason to choose PayPal: the purchase becomes the beginning of a useful care experience, rather than the end of a transaction.

The product's central object is a **Purchase Twin**, a durable, item-level record created from an authorized merchant's verified PayPal sandbox purchase. **CareOS** connects that record to source-backed product documentation, relevant changes, eligibility checks, and approved outcomes.

**Today:** bundled preview contains three fictional-product sample Twins and one Raspberry Pi 5 reference sample with official, attributed care guidance. The local database also contains the actually verified Sandbox purchase; it is not seeded into fixtures. Checkout defaults off and has no mock fallback. Public purchase records remain read-only without registration; CareOS only writes its own bounded conversations/quotas. Separate private Guardian capabilities do not grant authority to visitors; financial dispatch remains disabled. See [PayPal setup](docs/PAYPAL.md), [Guardian contract](docs/PRICE-GUARDIAN.md), [ADR 0002](docs/adr/0002-public-render-demo.md), [ADR 0003](docs/adr/0003-sandbox-checkout.md) and [CareOS sources](docs/CARE-SOURCES.md).

## Appearance

CareOS adds a persistent customer assistant, deterministic scoped receipt lookup, a factual briefing and inline document/care views. The verified fictional Forma F-01 still has no manufacturer manual. Care fixtures say **no live AI**; the implemented runtime adapter remains gated pending separate API-key/spending approval. See [CareOS engineering and activation](docs/CAREOS.md).

Pal Care's original product-passport identity uses blue for commerce, lavender for planned CareOS intelligence, and spacious white or midnight surfaces. **System is the default:** Light/Dark overrides are available from the appearance selector and persist locally. Geist Sans uses the maintained package's bundled, self-hosted fonts—no custom font service or browser request to Google Fonts.

See [Design system and visual references](docs/DESIGN.md). The Purchase Twin is the signature experience; planned AI and sample/verified-sandbox labels remain explicit in both themes.

## Product at a glance

| Capability | What it will do |
| --- | --- |
| **Purchase Vault** | Organize receipts, confirmations, product details, warranty documents, and available manuals for integrated purchases. |
| **Price Guardian** | Monitor participating-merchant price changes, evaluate the merchant's recorded policy, and support merchant-approved PayPal adjustments. |
| **Purchase Protection** | Surface potential official recalls, return deadlines, and warranty expirations with clear source and uncertainty labels. |
| **Product Care** | Provide document-grounded setup, maintenance, and repair guidance for supported products. |
| **Replacement Concierge** | Discover real replacement products and authorized retailer purchase links through Channel3. |

CareOS is **not** a separate always-running AI model for every purchase. It is a shared event-driven service operating on persistent Purchase Twins.

### The core demonstration we intend to build

1. A customer purchases an item from a **controlled demo merchant** through the **PayPal Sandbox**.
2. The backend verifies the captured payment and creates a Purchase Twin with an itemized receipt and recorded merchant-policy version.
3. A clearly labeled test price update changes the merchant's catalog price.
4. Deterministic eligibility rules validate the purchase; AI explains the decision using the stored policy and evidence.
5. The **merchant** reviews and approves the legitimate adjustment; the backend requests a PayPal **sandbox partial refund**.
6. CareOS independently reconciles the refund status and updates the Purchase Twin's event history.
7. Separate supported products demonstrate official recall references, product-care guidance, and Channel3 replacement search.

**No barcode scanner, autonomous external-retailer payments, universal PayPal-history access, subscription manager, or general dispute-claims platform is in scope.**

## Why it matters

Consumers often lose access to the documents, eligibility terms, and relevant information needed after checkout. A verified Purchase Twin could lower that friction. For merchants, a governed aftercare workflow could help resolve valid adjustments efficiently. **These are product hypotheses, not measured outcomes.**

Pal Care is an independent hackathon concept and **not an official PayPal product, warranty, insurance, coverage promise, or PayPal-sponsored service**. Eligibility and remedies depend on the actual merchant, manufacturer, and applicable terms.

## Technology

| Layer | Technology and scope |
| --- | --- |
| Frontend and backend | Next.js 16 App Router, React, TypeScript, Tailwind CSS, shadcn/ui |
| Purchase records | Render Managed PostgreSQL 17; Drizzle ORM and versioned SQL migrations |
| Demo identity and documents | Fixed fictional customer/merchant; public sample text documents; no login or uploads |
| CareOS intelligence | Deterministic assistance + explicit fixtures; official Responses/Zod adapter implemented, hosted inference not activated/verified |
| Payment workflow | Official PayPal Server SDK 2.5.0; actual Sandbox Orders/Payments completed-capture and Twin verification passed; webhooks deferred |
| Product safety | Real historical official CPSC source, conservative exact-model matching and assessment history; limited to one reviewed notice, no continuous monitoring |
| Replacement discovery | Care-first fixture comparison; real Channel3 adapter/fresh-offer infrastructure tested, actual provider acceptance pending |
| Merchant intelligence | Actual AG Studio 3.0.0 local evaluation, three custom widgets and scripted SDK tools; public license coverage/hosted AI pending |
| Deployment | Render preparation exists; public deployment and workers not verified |
| Testing | Vitest, Playwright, Postman; GitHub Actions CI |
| Development | OpenCode on a Tailscale-connected remote server; Mac client |

Using a ChatGPT subscription in OpenCode for development does **not** automatically provide deployed model API credits. Production credentials remain server-side.

See [Architecture](docs/ARCHITECTURE.md), [Technical Integrations](docs/INTEGRATIONS.md), and [Architecture Decision 0001](docs/adr/0001-modular-monolith.md).

## Running the project

Requires Node.js 22.23.x and pnpm 10.34.7. For the explicitly labeled fixture preview, **no account or credentials are required**:

```bash
corepack enable
pnpm install --frozen-lockfile
APP_ORIGIN=http://localhost:3000 pnpm dev
```

Open `http://localhost:3000`. Explore `/dashboard`, `/vault`, `/documents`, `/shop`, `/merchant`, `/merchant/intelligence`, `/safety` and `/replacements`. Bundled preview mode is labeled; checkout requires separate explicit Sandbox configuration. No database/provider outage silently falls back to mock payments. For permitted local Studio evaluation, set `AG_STUDIO_LOCAL_EVALUATION_ENABLED=true` with an exact local `APP_ORIGIN`; the original vendor watermark remains. This does not establish public/judging license coverage.

See [Setup & Render deployment](docs/SETUP.md) for PostgreSQL and hosting, and [PayPal Sandbox setup](docs/PAYPAL.md) for credentials, safety limits and the actual end-to-end verification checklist. Browsing needs no PayPal account. Sandbox checkout needs a fictional PayPal buyer; never commit buyer passwords.

Expired, unattempted checkouts now show an explicit expired status and no approval/capture/retry controls; they cannot be revived by a stale return URL. Previously attempted captures remain reconcilable after the deadline without a second capture. [Deadline contract](docs/API.md#checkout-deadline-contract).

For an existing attempted payment, **Check payment status** uses a reconciliation-only action: authenticated Orders v2 and Payments v2 GETs, never another capture. Pending eChecks remain unverified with an explicit explanation; failed/declined captures create no Twin. Only matching completed evidence creates the Twin, receipt, policy and purchase event exactly once. Current database mode requires all reviewed migrations through **0015**, applied only in an authorized operator environment. [Reconciliation contract](docs/API.md#capture-reconciliation-contract) · [Future Render webhook assessment](docs/PAYPAL-WEBHOOKS.md).

A separately approved, single USD 129.00 Sandbox balance experiment completed after tests and explicit buyer balance confirmation. Its snapshotted immediate-payment preference did not alter older payloads or the separate eCheck. The reserved request remains one-order scoped—do not rotate it or create additional purchases without approval. Migration 0005 is the historical preference addition, not the complete current migration baseline. [Controlled-test procedure](docs/PAYPAL.md#one-separate-immediate-payment-test).

Continuation contracts: [Merchant intelligence and AG Studio licensing](docs/INTELLIGENCE.md), [Recall Guardian and actual CPSC evidence](docs/RECALL-GUARDIAN.md), [Replacement Concierge and Channel3 activation gates](docs/REPLACEMENT-CONCIERGE.md), [verification ledger](docs/evidence/CONTINUATION-VERIFICATION.md). Real inference, Channel3 acceptance, public licensing/deployment and the actual Price Guardian refund remain separate gates; fixtures are not a substitute for that final proof.

Quality checks:

```bash
pnpm check
pnpm careos:evaluate # Versioned deterministic/fixture scenarios, not hosted inference
pnpm format:check
pnpm test:failure # Outage redaction + disposable test-login cleanup
pnpm exec playwright install chromium
pnpm test:e2e
# If another local preview uses port 3100:
E2E_PORT=3104 pnpm test:e2e
# With a dedicated TEST_DATABASE_URL configured:
pnpm test:integration
# Run browser tests against PostgreSQL-backed records:
E2E_DATA_SOURCE=database pnpm test:e2e
# Exclusive synthetic Guardian test DB flow: never overlap with other DB suites
pnpm test:guardian:e2e
# Focused Firefox + WebKit essential journeys; emulation, not actual-device proof:
pnpm exec playwright install --with-deps firefox webkit
E2E_PORT=3108 pnpm test:compat
```

Repository documentation/configuration can also be checked separately:

```bash
node scripts/verify-repository.mjs
```

This verifies only repository documentation and configuration. **It is not an application build or a PayPal integration test.**

## Hackathon judging

- **Event:** [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/)
- **Deadline:** November 12, 2026 at 12:00 PM PST
- **Rules:** [Official rules](https://paypalaihackathon.devpost.com/rules)
- **Status / reviewer guide:** [Judging & Demo](docs/JUDGING.md)
- **Demo URL:** *Pending deployment*
- **Public video (under 3 minutes):** *Pending recording*
- **Dashboard access:** Public fictional demo, no login. Future operator credentials must never be committed or given unrestricted public access.

Judges should evaluate only implemented behavior. A completed submission will include verifiable screenshots, a public demo, source code, an open-source license, and real sandbox capture/refund evidence. No simulated data will be described as a live provider event.

## Repository map

```text
.github/              Repository automation, code ownership and PR template
src/app/              Public demo pages, bounded checkout/CareOS and protected operator routes
src/components/       Accessible UI and original product illustrations
src/db/               Drizzle schema, connection, read-only queries and seed service
src/lib/demo/         Fictional fixtures, presentation and server-only repository
src/lib/commerce/     Sandbox adapter, verification, authorization and checkout services
src/lib/careos/       Scoped assistance, evidence retrieval, providers and bounded conversations/budgets
drizzle/              Reviewed SQL migrations and schema snapshots
tests/                Unit, PostgreSQL integration and browser/accessibility tests
render.yaml           Web service + private-network PostgreSQL Blueprint
docs/SETUP.md         Local development, tests and Render deployment
docs/API.md           Current HTTP surface, scopes and future boundaries
docs/PAYPAL.md        Secure Sandbox configuration and actual verification checklist
docs/PAYPAL-WEBHOOKS.md Planned verified-delivery design and Render prerequisites
postman/              Credential-free Pal Care checkout API collection
docs/PRODUCT.md       Product promise, requirements, scope and boundaries
docs/ARCHITECTURE.md  Data flows, services and payment safeguards
docs/INTEGRATIONS.md Technology partners and external API boundaries
docs/JUDGING.md      Judge-oriented evidence and demonstration criteria
docs/STATUS.md       Explicit working vs. planned functionality
docs/DESIGN.md       Light/dark tokens, component rules and visual references
docs/CAREOS.md       Glance/Tap/Talk architecture, limits and gated runtime activation
docs/CARE-SOURCES.md Official reference documentation and licence register
docs/SECURITY.md     Threat model and authorization requirements
docs/adr/             Architecture decisions
AGENTS.md             OpenCode engineering expectations
SECURITY.md           Private vulnerability reporting instructions
LICENSE               MIT open-source license
```

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Application code is licensed under [MIT](LICENSE). Raspberry Pi guidance excerpts and derived care summaries retain [CC BY-SA 4.0 with attribution](docs/CARE-SOURCES.md). Geist fonts retain their [SIL Open Font License](public/licenses/geist-OFL.txt), also served at `/licenses/geist-OFL.txt`.

**Brand note:** “Pal Care” is a provisional project name. The project uses its own identity and does not imply affiliation or endorsement by PayPal. Product names and trademarks belong to their respective owners.
