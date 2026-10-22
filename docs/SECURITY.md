# Security and privacy design

## Sensitive assets

Stage 1's only external secret is the PostgreSQL connection URL. Demo records are fictional and public. Future sensitive assets include PayPal credentials and transaction identifiers, merchant policies, model/search API keys and operator credentials. No real customer data is allowed in this MVP.

## Current public-demo boundary

- No Supabase, login, registration or personal uploads. No public mutation, provider-call, seed or database-admin endpoints.
- Server-only repository and PostgreSQL read-only sessions; scoped queries use fixed demo identities and bind parameters. Connection/query timeouts and pool size are bounded.
- Sample origins and USD nonnegative integer prices are database-constrained. Sample downloads are plain-text attachments, never proof of payment.
- Database mode reports errors instead of falling back; readiness returns 503. Browser-visible errors never include connection strings or raw SQL. Migration/seed errors are also redacted.
- Render Blueprint blocks external database access. Local PostgreSQL binds to loopback. No provider secrets are needed in Stage 1.
- Headers deny framing/object embedding and enable MIME sniffing protection, permissions and referrer policies. This is a baseline, not a complete production CSP or independent security audit.
- Future financial/merchant actions need separate operator authorization. Persistent rate limits and paid-resource budgets must be implemented **before** exposing those endpoints; they are not claimed as implemented now.

## Required safeguards

1. **Authorization:** public reads expose fictional records only; future consequential operations must verify operator authority and exact merchant/record/action scope and limits on the server.
2. **Secret isolation:** only trusted server processes access database/provider secrets. Never commit `.env`, tokens or sandbox passwords. Use separate migration credentials and a least-privilege runtime database role before expanding to write workflows.
3. **Payment integrity:** use integer minor currency units, trusted PayPal captures and verified authorization and remaining refundable amount.
4. **Safe retries:** durable payment operation IDs, concurrency-safe reservations, no duplicate refunds after timeouts.
5. **Webhook authenticity:** validate PayPal webhook signatures and accept each provider event once.
6. **Documents:** current sample documents are public. Personal uploads are out of scope. Before adding private documents, explicitly design authorization, storage, validation and deletion.
7. **Prompt-injection resistance:** treat uploaded files and third-party text as untrusted content; AI output cannot change security policy.
8. **Truthful states:** requested, processing, completed and failed are distinct; completion depends on authoritative provider confirmation.
9. **Auditability:** append state changes with actor and source references, without unnecessarily storing or logging sensitive documents.
10. **Regression checks:** invalid ownership, cancelled checkout, simultaneous refund requests, webhook replays, unexpected policy versions and provider failures.

## Public demo

Use fictional identities and PayPal sandbox operations only. Never commit buyer passwords. Both dashboards are publicly browsable, not signed-in accounts; operator actions are separately protected. Respect manufacturer and retailer content licensing.

## Scope disclaimer

Pal Care does not independently underwrite warranties, issue insurance, decide PayPal Purchase Protection eligibility, or guarantee merchant price-match terms.
