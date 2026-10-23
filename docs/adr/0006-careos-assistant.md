# ADR 0006: One evidence-backed ownership assistant

**Status:** Accepted implementation; fixture/runtime boundary explicit
**Date:** 2026-10-23

## Decision

Build Glance (deterministic care briefing), Tap (direct record/guide navigation) and Talk (one persistent, context-labeled assistant). Keep Next.js modular monolith, semantic blue/lavender themes and the existing checkout implementation. Mount the assistant host in the root layout, rather than separate page chatbots or a checkout-remounting route rewrite.

Server code resolves fixed demo scope, retrieves exact-model evidence and constructs safe actions. Language understanding/explanation may use one shared Responses-compatible provider. Strict Zod output, quote/source checks and server-rendered factual records constrain the model; no AI financial or merchant tool exists.

Default to explicitly labeled deterministic fixtures. Implement the official Responses adapter now, but require separate API credentials, explicit enablement, a restricted CareOS writer and persistent spending reservations before live dispatch. No subscription credential reuse or automatic live-to-fixture fallback. See [CareOS engineering contract](../CAREOS.md).

Add separate knowledge/conversation/request/budget tables through versioned migrations 0006/0007. Existing payment tables, constraints, immutable evidence and pending eCheck remain unchanged. A separate sample Raspberry Pi 5 Twin uses licensed official guidance; the verified fictional Forma F-01 receives no invented manual.

## Tradeoffs

Curated small-corpus lexical retrieval is inspectable and avoids embeddings/vector services. It will miss some paraphrases; unsupported/missing-document responses are intentional. Expand retrieval only after evaluation demonstrates the need.

Complete validated responses are rendered rather than streaming unchecked partial JSON. Provider-owned conversation storage, arbitrary web tools, voice, background monitoring, autonomous agents and paid sponsor integrations are excluded from Stage 3.

Root state preserves navigation; PostgreSQL provides bounded same-browser transcript restoration. This is not authenticated multi-customer production memory. Expiry and operator cleanup are explicit. Quote/schema checks do not prove truth or eliminate prompt injection; actual hosted evaluation remains a separate release gate.
