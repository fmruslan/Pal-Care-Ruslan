# Security Policy

Pal Care is a hackathon prototype under active development. It is not intended for production financial use until independent review, comprehensive testing and merchant authorization are complete.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** feature when it is enabled in the repository Security settings. Avoid posting exploits, tokens or customer information in public issues. If private reporting is not enabled, contact the repository owner through a private channel shown on their GitHub profile before public disclosure.

## Security priorities

- PayPal access tokens and service-role credentials stay on the backend.
- Public views expose only the fixed fictional demo scope and selected verified-sandbox references when available. Bounded customer checkout uses originating-cookie authorization; merchant actions/refunds require separate operator authority and are not implemented.
- Payment amounts come from authoritative merchant records and code-enforced policy, never unvalidated model output.
- Refunds require merchant approval, persistent idempotency keys and verification of provider status.
- Webhook signatures must be checked before processing; duplicate notifications are safe.
- Personal uploads are not supported. Sample documents are public fictional text attachments. Future external documents must be treated as untrusted input.
- Public demos use synthetic customers and sandbox transactions only.
- Stage 2 checkout defaults off, accepts only trusted fixed-price catalog items, and uses persistent quotas/leases/idempotency. Never resubmit an ambiguous capture or treat return query parameters as payment evidence. Actual PayPal/webhook verification must be reported separately from mock tests.

Implementation detail: [docs/SECURITY.md](docs/SECURITY.md).
