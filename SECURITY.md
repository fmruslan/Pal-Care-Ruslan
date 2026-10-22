# Security Policy

Pal Care is a hackathon prototype under active development. It is not intended for production financial use until independent review, comprehensive testing and merchant authorization are complete.

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** feature when it is enabled in the repository Security settings. Avoid posting exploits, tokens or customer information in public issues. If private reporting is not enabled, contact the repository owner through a private channel shown on their GitHub profile before public disclosure.

## Security priorities

- PayPal access tokens and service-role credentials stay on the backend.
- All purchase and document access is explicitly scoped to the correct user and merchant.
- Payment amounts come from authoritative merchant records and code-enforced policy, never unvalidated model output.
- Refunds require merchant approval, persistent idempotency keys and verification of provider status.
- Webhook signatures must be checked before processing; duplicate notifications are safe.
- Uploaded documents are treated as private data and untrusted prompt inputs.
- Public demos use synthetic customers and sandbox transactions only.

Implementation detail: [docs/SECURITY.md](docs/SECURITY.md).