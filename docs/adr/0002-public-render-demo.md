# ADR 0002: Render PostgreSQL and public fictional demo identities

**Status:** Accepted; Stage 1 implemented locally
**Date:** 2026-10-21
**Supersedes:** ADR 0001's Supabase, customer-authentication and private-storage choices. Its modular-monolith and financial-integrity principles remain valid.

## Context

A solo hackathon entry must be immediately explorable by judges without account setup. One integrated demo merchant and fictional customer are sufficient. Supabase/Auth/Storage add onboarding and operational work unnecessary for this sample-only MVP.

## Decision

Use Next.js 16 + React + TypeScript on Render, with Render Managed PostgreSQL and Drizzle. Keep one modular application. Use versioned SQL migrations generated from `src/db/schema.ts` and an idempotent CLI sample seed. Both dashboards are public and use fixed fictional identities. No real customer information, login or registration is collected.

Stage 1 reads sample data only. Original fictional receipts/care cards are text records in PostgreSQL, served as attachments. There is no personal upload facility or private object store. Bundled fixtures provide a labeled offline preview; database mode must not fall back after an error.

Consequential actions are not public merely because the merchant dashboard is public. Future catalog changes, scenario controls, approvals and refunds require separate server-side operator authorization, allowed action/record scopes, persistent rate limits, resource budgets and deterministic financial rules. No such HTTP mutation endpoints ship in Stage 1.

Only an actual PayPal Sandbox response may establish verified transaction/refund status. Sample records cannot masquerade as verified payments; Stage 1 enforces sample origins in PostgreSQL. Sandbox-enabled schema and authorization changes require tests and a new migration.

## Benefits

- Immediate judge access, no browsing credentials.
- One hosting/database platform and migration system.
- No real PII, customer-password lifecycle or personal-document retention.
- Read-only application sessions and explicit sample provenance reduce accidental misuse.

## Tradeoffs and future work

- This is not a multi-customer production security architecture. Before real customers, revisit identity, ownership, authorization, privacy and storage.
- Shared public sandbox actions need concurrency controls, reconciliation and abuse limits before release.
- Paid AI/search access cannot be unrestricted; add provider budgets and durable rate limiting with those integrations.
- Real receipts/manuals need a licensed-content/private-storage design. Do not put private files on Render's ephemeral filesystem.
- Render deployment requires the owner's account, GitHub connection and cost approval. A Blueprint is preparation, not evidence of deployment.
