# HTTP surface — Stage 1

No endpoint currently moves money, changes merchant records, calls AI, or spends provider credits. Customer/merchant dashboards are publicly readable fictional demos, not authenticated accounts.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/` | Product landing page and links to both demos |
| GET | `/dashboard` | Fictional customer overview, sample counts, Twins and events |
| GET | `/vault?q=…&category=…` | Sample purchase search/category filter; no database writes |
| GET | `/vault/:uuid` | Sample Twin, documents and events; 404 if malformed/unknown |
| GET | `/documents` | Public fictional documents; no upload capability |
| GET | `/merchant` | Read-only sample inventory/events; future analytics placeholder |
| GET | `/api/documents/:uuid/download` | Allowlisted sample text attachment; 404 if malformed/unknown; POST returns 405 |
| GET | `/api/health` | Liveness JSON, explicitly `payments: not-implemented` |
| GET | `/api/ready` | Selected data source readiness; 503 on invalid config, unavailable DB or missing seed |

GET routes also support the framework's HEAD handling. No checkout, approval, refund, catalog-write or seeding HTTP routes exist. CLI migration and seed commands are operator-only tasks. Public route parameters never choose customer/merchant scope or filesystem paths.

All mutable workflows below are **future work**: PayPal create/capture, provider-signed webhooks, idempotent merchant-approved refunds, controlled scenario changes and bounded AI/search calls. Server-side authorization, origin/CSRF checks as appropriate, persistent rate limits and spending ceilings must accompany them. A hidden button or a public merchant dashboard is not authorization.
