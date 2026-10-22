# Application setup and deployment

## Prerequisites

- Node.js 22.23.x (pinned in `.node-version`), pnpm 10.34.7 (`corepack enable`).
- Docker Compose for local PostgreSQL, or an existing dedicated PostgreSQL 17 database.
- No Supabase/customer accounts. Browsing needs no PayPal credentials; actual Sandbox checkout requires the separate setup in [PAYPAL.md](PAYPAL.md). No AI/sponsor credentials are needed.

All direct JavaScript dependencies are exact-pinned in `package.json` and `pnpm-lock.yaml`. TypeScript 5.9 and ESLint 9 are pinned for compatibility with Next's current lint plugins; update the lint toolchain together when its peer support changes. Run ESLint independently: Next.js 16 builds do not run it.

## Account-free fixture preview

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. With no `.env.local`, the default is `fixtures`: every dashboard says **Bundled preview · database not in use**. This is a labeled preview, not a claim of database or provider integration.

If `.env.local` exists, it controls the data source. To deliberately preview fixtures, use `DEMO_DATA_SOURCE=fixtures pnpm dev`. No secret or fake user is substituted.

## PostgreSQL-backed development

1. Copy `.env.example` to `.env.local`. Choose a strong random local password, for example with `openssl rand -hex 24`. Do not share it or commit the file.
2. Set `LOCAL_POSTGRES_PASSWORD` to that value and `DATABASE_URL` to `postgresql://palcare:YOUR_LOCAL_PASSWORD@127.0.0.1:55432/palcare`. The placeholder is not a credential; replace it. Use URL encoding if your password contains reserved characters.
3. Set `DEMO_DATA_SOURCE=database`.
4. Start PostgreSQL, migrate, seed and run:

```bash
docker compose --env-file .env.local up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Local database port 55432 binds to loopback only. From the Mac, use an SSH tunnel for development if necessary; do not expose PostgreSQL publicly. `docker compose --env-file .env.local stop` stops the local database without deleting its volume. Never run a volume reset against an unknown database.

The seed inserts a fictional customer/merchant and three products, Twins, documents and events. Deterministic IDs and `ON CONFLICT DO NOTHING` make repeated seeds safe without overwriting existing records. Data source banners now say **PostgreSQL sample records**. A configured but unavailable/unseeded database produces an error, not a fixture fallback.

## Schema changes

1. Edit `src/db/schema.ts`.
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
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests run the production build on port 3100, at desktop and mobile sizes, including axe accessibility scans. `pnpm build` is required first. Screenshots and HTML reports are git-ignored in `test-results/` and `playwright-report/`.

Integration tests require an **explicit dedicated `TEST_DATABASE_URL` with a database name ending in `_test`**. Create a separate database (for example `palcare_stage2_test`) and set its URL privately. Never point these tests at your app/deployed database: checkout tests create provider-double evidence in that test database and clean it afterward. They do not contact PayPal. Tests run serially to avoid shared migration/seed races.

```bash
pnpm test:integration
E2E_DATA_SOURCE=database pnpm test:e2e
```

The latter needs a configured, migrated, seeded `DATABASE_URL`. Browser tests use fixtures by default even if local development uses database mode. Both modes are tested in CI.

## Render deployment preparation

`render.yaml` describes a Node web service and Render Managed PostgreSQL 17 in the same region, with external database access blocked. It uses **paid plans** to avoid trial expiry/sleep disrupting judging. Review Render pricing and approve costs before creating resources. No cloud resources have been created by this implementation.

1. Sign in to Render and connect GitHub to `fmruslan/Pal-Care-Ruslan`.
2. Create a Blueprint from `render.yaml`; review plan costs/region before applying.
3. Render injects the private internal `DATABASE_URL`; `DEMO_DATA_SOURCE=database` is set. No API keys are needed.
4. Build: `corepack enable && pnpm install --frozen-lockfile && pnpm build`.
5. Pre-deploy: `pnpm db:migrate && pnpm db:seed`. These CLI scripts use deployment/operator access, not public routes. Do not disable dev dependencies in the build/pre-deploy environment; they contain `tsx`.
6. Start: `pnpm start --port $PORT`, bound to `0.0.0.0`.
7. `/api/ready` must return 200 with `source: database`; verify dashboards and downloads. `/api/health` is only liveness, not database/provider proof.
8. Keep the service/database funded and available through December 15, 2026. Automatic deploys wait for GitHub checks to pass.

Use the internal database URL between Render resources. For external administration, temporarily allow only your specific IP and use TLS; never disable certificate verification globally. Restrict database roles further before introducing write/provider workflows. No secrets belong in `NEXT_PUBLIC_*` variables.

## Next-stage configuration (not used now)

See [PAYPAL.md](PAYPAL.md) for Sandbox app/merchant/buyer setup and verification. Stage 2's bounded completed-purchase/Twin flow now has actual local provider/database acceptance evidence, in addition to independent security/idempotency regressions. New environments still need explicit private configuration and their own verification; no credentials or completed capture are seeded into preview data. Webhooks, AI, Channel3, AG Studio and refunds remain deferred. [Evidence](evidence/STAGE2-VERIFICATION.md).
