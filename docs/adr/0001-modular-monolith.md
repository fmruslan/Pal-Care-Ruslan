# ADR 0001: Modular monolith and commerce boundaries

**Status:** Historical initial design. Modular monolith retained; Supabase/auth/storage superseded by [ADR 0002](0002-public-render-demo.md).
**Date:** 2026-10-21

## Context

A solo hackathon project needs meaningful AI, safe PayPal Sandbox operations, and a high-quality customer journey, with minimal infrastructure complexity.

## Decision

Use **Next.js 16 + TypeScript**, Supabase PostgreSQL, Supabase Auth and private Storage, with typed server-side domain modules. Isolate PayPal payments, policy rules, Purchase Twin persistence, AI document processing, recall data, and replacement discovery. Add a durable background worker for care events. Use AG Studio for merchant analytics and Channel3 for replacement search.

## Benefits

A smaller operating surface, fewer transaction boundaries, simpler debugging and maintainable purchase history.

## Tradeoffs

High-throughput ingestion or long-running analysis may eventually require separate services. Keep provider interfaces behind adapters to allow later extraction.

## Explicit non-goals

Microservices, a language model continuously running for each purchase, barcode scanning, universal consumer PayPal account access, multi-merchant payments settlement, and external-retailer checkout automation.
