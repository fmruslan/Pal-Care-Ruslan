# Pal Care

**Everything you buy. Taken care of.**  
*Powered by CareOS · Independent PayPal AI Hackathon project*

> **Project status: Foundation / documentation.** This repository currently defines the product, architecture, implementation contracts, and judging plan. **The application, integrations, and hosted demo are not yet implemented.** Do not mistake planned features for working features. See [Implementation Status](docs/STATUS.md).

Pal Care explores a new reason to choose PayPal: the purchase becomes the beginning of a useful care experience, rather than the end of a transaction.

The product's central object is a **Purchase Twin**, a durable, item-level record created from an authorized merchant's verified PayPal sandbox purchase. **CareOS** connects that record to source-backed product documentation, relevant changes, eligibility checks, and approved outcomes.

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

| Layer | Planned technology |
| --- | --- |
| Frontend and backend | Next.js 16 App Router, React, TypeScript, Tailwind CSS, shadcn/ui |
| Purchase records, auth, files | Supabase PostgreSQL, Supabase Auth, private Supabase Storage; Drizzle ORM |
| AI intelligence | Server-side multimodal model API, schema validation with Zod, source-grounded explanations |
| Payment workflow | PayPal Orders v2, Payments v2, verified webhooks, Sandbox merchant and buyer |
| Product safety | US Consumer Product Safety Commission (CPSC) public recall data |
| Replacement discovery | Channel3 API; real merchant product records and links |
| Merchant intelligence | AG Studio, including agent-driven analysis and custom widgets |
| Deployment | Render web service and scheduled/background work |
| Testing | Vitest, Playwright, Postman; GitHub Actions CI |
| Development | OpenCode on a Tailscale-connected remote server; Mac client |

Using a ChatGPT subscription in OpenCode for development does **not** automatically provide deployed model API credits. Production credentials remain server-side.

See [Architecture](docs/ARCHITECTURE.md), [Technical Integrations](docs/INTEGRATIONS.md), and [Architecture Decision 0001](docs/adr/0001-modular-monolith.md).

## Running the project

**Not yet available.** This first commit is a documentation and repository-quality foundation. After the Next.js application is bootstrapped, this section must be replaced with verified installation, environment configuration, migrations, seed commands, test commands, and sample sandbox buyer instructions. See the [Implementation Status](docs/STATUS.md) for the exact distinction between planned and working pieces.

The repository itself can currently be verified without installing dependencies:

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
- **Demo credentials:** *Pending secure judge-access setup; never commit private secrets*

Judges should evaluate only implemented behavior. A completed submission will include verifiable screenshots, a public demo, source code, an open-source license, and real sandbox capture/refund evidence. No simulated data will be described as a live provider event.

## Repository map

```text
.github/              Repository automation, code ownership and PR template
docs/PRODUCT.md       Product promise, requirements, scope and boundaries
docs/ARCHITECTURE.md  Data flows, services and payment safeguards
docs/INTEGRATIONS.md Technology partners and external API boundaries
docs/JUDGING.md      Judge-oriented evidence and demonstration criteria
docs/STATUS.md       Explicit working vs. planned functionality
docs/SECURITY.md     Threat model and authorization requirements
docs/adr/             Architecture decisions
AGENTS.md             OpenCode engineering expectations
SECURITY.md           Private vulnerability reporting instructions
LICENSE               MIT open-source license
```

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).

**Brand note:** “Pal Care” is a provisional project name. The project uses its own identity and does not imply affiliation or endorsement by PayPal. Product names and trademarks belong to their respective owners.