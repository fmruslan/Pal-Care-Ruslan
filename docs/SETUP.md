# Application setup and deployment

## Prerequisites

- Node.js 22.23.x (pinned in `.node-version`), pnpm 10.34.7 (`corepack enable`).
- Docker Compose for local PostgreSQL, or an existing dedicated PostgreSQL 17 database.
- No Supabase/customer accounts. Browsing needs no PayPal credentials; actual Sandbox checkout requires the separate setup in [PAYPAL.md](PAYPAL.md). No AI/sponsor credentials are needed.

Runtime JavaScript dependencies are exact-pinned; Prettier's development range is resolved by the frozen lockfile. TypeScript 5.9 and ESLint 9 are pinned for compatibility with Next's lint plugins; update that toolchain together when peer support changes. Next.js builds do not run ESLint.

## Account-free fixture preview

```bash
pnpm install --frozen-lockfile
APP_ORIGIN=http://localhost:3000 pnpm dev
```

Open `http://localhost:3000`. With no `.env.local`, the default is `fixtures`: every dashboard says **Bundled preview · database not in use**. This is a labeled preview, not a claim of database or provider integration.

If `.env.local` exists, it controls the data source. Use a clean runtime file without owner/bootstrap secrets. To deliberately preview fixtures, set `DEMO_DATA_SOURCE=fixtures` and exact `APP_ORIGIN=http://localhost:3000`. No secret, unsafe writer fallback or fake payment is substituted.

## PostgreSQL-backed development

1. Keep Docker bootstrap/owner credentials in a separate operator-only environment file **outside the web application directory**, not `.env.local`. Generate passwords privately; never commit/share them. Start the local database with `docker compose --env-file /path/to/private-postgres.env up -d --wait` (the private file defines `LOCAL_POSTGRES_PASSWORD`).
2. In the separately authorized operator environment only, configure `MIGRATION_DATABASE_URL` for reviewed migrations and sample seeding. It must not remain in the web environment, secret files, build image or readable deployment directory. Bootstrap passwords, `ADMIN_DATABASE_URL` and private grant-issuer `OPERATOR_DATABASE_URL` are also forbidden in the runtime.
3. Apply reviewed migrations through **0015 (29 tables)**. For an existing application database, do **not** seed, reset, rewrite evidence or run an upgrade without separate owner approval. Stop writers and use the preservation procedure below.
4. Review `scripts/reader-role.sql`, `careos-role.sql` and the capability-specific writer templates. Provision actual independent login/passwords privately. Runtime logins must not own database/schema objects or be able to assume owner/admin roles. Audit PUBLIC grants: revoke inappropriate CREATE/TEMP authority at database/schema level and grant only required table/column/sequence operations. Membership `NOINHERIT` alone does not prevent `SET ROLE`; a capability group grant can explicitly use `INHERIT TRUE, SET FALSE`.
5. Copy `.env.example` to `.env.local`. Set `DATABASE_URL` to the restricted reader and **`CAREOS_DATABASE_URL`** to the conversation-only writer, even for fixture responses. Enabled checkout/Guardian/discovery require their own explicit writer URL; missing values never fall back. No role/password is provisioned automatically by web startup.
6. Set `DEMO_DATA_SOURCE=database`, exact `APP_ORIGIN=http://localhost:3000`, `CAREOS_PROVIDER=fixture`, and keep all financial/paid-service activation flags off. Restart after configuration changes.

In the private operator execution environment, not the web service:

```bash
pnpm db:migrate
pnpm db:seed # New database only; existing records are preserved with ON CONFLICT DO NOTHING.
```

In the clean web runtime environment, run `pnpm exec tsx scripts/verify-runtime-authority.ts` (read-only) and `pnpm dev`. A PASS requires actual login/effective/assumable roles, positive grants and forbidden-authority checks—not a matching role name. A BLOCKED result requires fixing external configuration, never weakening preflights.

Local PostgreSQL port 55432 binds to loopback. Use an SSH tunnel from the Mac if needed; do not expose PostgreSQL publicly. Stop Compose using its private operator env file without deleting the volume. Never reset an unknown database. Production/container isolation must also prevent the web process reading operator secret files; an environment-variable naming convention is not OS isolation.

The sample seed inserts fictional identities, three fictional-product Twins, one reference Raspberry Pi sample and an inactive future-only Guardian draft. The reference is not sold in the Sandbox shop. It seeds no mock Sandbox capture/refund, approved policy or operational grant. An unavailable, unsafe or unseeded database fails visibly without fixture fallback.

## Schema changes

Current baseline is **0015**, including 0013 historical-evidence guards, 0014 independent model-call reservations and 0015 terminal capture/approval guards. No historical usage is invented/backfilled. Existing original rows remain byte-for-byte unchanged by these migrations; legitimate leases, first capture/finalization and reconciliation remain supported.

For an existing database, after **separate owner approval**, stop writers and run `STAGE5_MIGRATION_APPROVED=true pnpm exec tsx scripts/verify-stage5-upgrade.ts --apply` in the isolated migration environment. It compares canonical row counts/hashes for every pre-existing public table before/after, applies only reviewed migrations, and performs no seed/provider call. Its approval flag is an explicit operational safeguard, not permission to deploy or transact. Investigate a mismatch without resets or financial retries. The isolated upgrade test rehearses this from 0012 with completed/pending/cancelled synthetic records and a repeated no-op migration.

Older upgrade scripts document historical stages, not the current setup path. Free official-source verification and private recall refresh are separate actions. Refresh now requires a restricted `RECALL_DATABASE_URL` in the private ingestion environment; it processes resumable bounded batches, not comprehensive recall monitoring. [Source scope](RECALL-GUARDIAN.md).

Actual Studio local evaluation uses `AG_STUDIO_LOCAL_EVALUATION_ENABLED=true` and an exact local `APP_ORIGIN`, retaining vendor warnings/watermark. This is not public license coverage; obtain owner-approved coverage through judging before deploying. Channel3 defaults to `DISCOVERY_PROVIDER=fixture`; leave its key/activation flags blank/off until separately authorized. [License contract](INTELLIGENCE.md) · [credential and budget procedure](REPLACEMENT-CONCIERGE.md).

1. Edit the relevant `src/db/*-schema.ts` module (or original `schema.ts`).
2. `pnpm db:generate` creates SQL and a snapshot in `drizzle/`.
3. Review and commit them; then `pnpm db:migrate`.

Do not use `drizzle-kit push`, edit applied migrations, or run competing migration systems. Migration 0001 adds constrained Sandbox provenance, checkout operations and rate limits. Existing sample records cannot be relabeled without matching checkout evidence.

## Tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm test:failure
pnpm exec playwright install --with-deps chromium firefox webkit
pnpm test:e2e
E2E_PORT=3108 pnpm test:compat
```

Browser tests run the production build on port 3100, at desktop and mobile sizes, including axe accessibility scans. `pnpm build` is required first. Runner artifacts and HTML reports are isolated per data mode under `test-results/{fixtures,database}` and `playwright-report/{fixtures,database}`, preventing trace collisions when local suites run on separate ports. They are git-ignored.

Integration tests require an **explicit dedicated local `TEST_DATABASE_URL` ending `_test`** with administrative authority for migrations and disposable test logins. The preservation rehearsal also creates/drops one randomly named isolated `_test` database. Never point tests at your app/deployed database. Provider-double records exist only in test databases. Tests run serially; no actual PayPal/model/Channel3 call is made.

```bash
pnpm test:integration
E2E_DATA_SOURCE=database pnpm test:e2e
pnpm test:guardian:e2e
```

Database browser servers provision actual disposable restricted reader/CareOS/Guardian logins from that dedicated test connection. The web child receives no owner/bootstrap URL or password. PUBLIC TEMP is revoked in the dedicated test database; isolated tests prove forbidden writes, ownership and assumable-role rejection. Model/PayPal activation is forced off. Run the exclusive Guardian suite **after**, never concurrently with integration or normal database browser suites. Its Node-only injected gateway creates/cleans synthetic test evidence, not real refunds. Firefox/WebKit checks exercise essential customer/merchant journeys; mobile emulation is not an actual-device/Safari certification.

## Render deployment preparation

`render.yaml` describes a Node web service and Render Managed PostgreSQL 17 in the same region, with external database access blocked. It uses **paid plans** to avoid trial expiry/sleep disrupting judging. Review Render pricing and approve costs before creating resources. No cloud resources have been created by this implementation.

1. Sign in to Render and connect GitHub to `fmruslan/Pal-Care-Ruslan`.
2. Create a Blueprint from `render.yaml`; review plan costs/region before applying.
3. Provision explicit restricted reader and CareOS login URLs privately and fill `DATABASE_URL`, `CAREOS_DATABASE_URL`, and exact deployed HTTPS `APP_ORIGIN` in Render. The Blueprint deliberately does **not** inject the default owner connection string. No provider API keys are needed for fixture assistance.
4. Build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`.
5. Run reviewed migrations/bootstrap separately in an approved operator or CI execution environment whose owner credentials never enter the web service. There is no web pre-deploy migration/seed command. A separate instance alone does not isolate secrets if its privileged variables are also supplied to the web service. Use backwards-compatible additive migrations for overlapping deploys; do not roll back by deleting evidence.
6. Start: `pnpm start --port $PORT`, bound to `0.0.0.0`.
7. `/api/ready` must return 200 with `source: database`. It checks exact origin, configured local capabilities, schema/grants, active evidence guards and required sample identities with a three-second deadline; metadata is briefly cached. No external provider is called. `/api/health` is liveness only. Verify complete customer/merchant journeys separately.
8. Keep the service/database funded and available through December 15, 2026. Automatic deploys wait for GitHub checks to pass.

Use private-network scoped connection URLs. For external administration, temporarily allow only the operator IP and use TLS; never disable certificate verification. Readers share at most three connections and each distinct writer at most two per web process; budget across instances, rolling deploy overlap, private jobs and administrative headroom. No secrets belong in `NEXT_PUBLIC_*`. Actual environment verification remains blocked until provisioning, approved migration and read-only authority/readiness checks pass.

## Provider configuration and remaining work

See [PAYPAL.md](PAYPAL.md) for Sandbox setup and [CareOS](CAREOS.md) for fixture behavior, restricted DB roles, cleanup and the separately approved live API activation procedure. Stage 2 has actual local provider/database acceptance evidence. New environments need their own verification; no credentials or completed capture are seeded into preview data. Hosted model inference, webhooks, Channel3, AG Studio and refunds remain unverified/unimplemented as applicable. [Payment evidence](evidence/STAGE2-VERIFICATION.md).
