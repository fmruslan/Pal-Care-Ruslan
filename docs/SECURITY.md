# Security and privacy design

## Sensitive assets

PayPal credentials and transaction identifiers, purchase documents, merchant prices and policies, model API keys, Supabase service credentials, and customer order history.

## Required safeguards

1. **Authorization:** verify user/tenant/merchant role for every operation; use database RLS where appropriate.
2. **Secret isolation:** only trusted server processes may access provider secrets. Never commit `.env`, tokens or sandbox passwords.
3. **Payment integrity:** use integer minor currency units, trusted PayPal captures and verified authorization and remaining refundable amount.
4. **Safe retries:** durable payment operation IDs, concurrency-safe reservations, no duplicate refunds after timeouts.
5. **Webhook authenticity:** validate PayPal webhook signatures and accept each provider event once.
6. **Private documents:** authenticated access, private object storage, short-lived signed URLs, validated uploads and user deletion capabilities.
7. **Prompt-injection resistance:** treat uploaded files and third-party text as untrusted content; AI output cannot change security policy.
8. **Truthful states:** requested, processing, completed and failed are distinct; completion depends on authoritative provider confirmation.
9. **Auditability:** append state changes with actor and source references, without unnecessarily storing or logging sensitive documents.
10. **Regression checks:** invalid ownership, cancelled checkout, simultaneous refund requests, webhook replays, unexpected policy versions and provider failures.

## Public demo

Use synthetic customer identities and PayPal sandbox operations. Never commit buyer passwords. Judge access should be provided through authorized demo accounts. Respect manufacturer and retailer content licensing.

## Scope disclaimer

Pal Care does not independently underwrite warranties, issue insurance, decide PayPal Purchase Protection eligibility, or guarantee merchant price-match terms.
