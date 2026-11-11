# Render judge setup

Hosted-only DeepSeek Flash uses the existing Responses SDK, North conversations,
grounding, strict plans and native Studio execution. GreatBison/Sol is not deployed
or reconfigured. Browsing is public; AI requires separate existing customer/Studio
capability tokens. No provider API key goes into a browser or chat.

## 1. Prepare access and the genuine historical copy

Run from the checked-out final `main`, using a private terminal. Files below must
stay outside Git; do not post their contents or screen-record them.

```sh
corepack pnpm exec tsx scripts/prepare-render-judge.ts --access /tmp/opencode/render-access.env
```

Read that file privately. The two `*_ACCESS_HASH` values go to Render; the two
`*_BROWSER_ACCESS_TOKEN` values are for `/ai-evaluation` only, not Render secrets.

Export the original October 22 USD129 verified Sandbox record using an existing
operator connection with SELECT on its checkout, Twin, documents and event. Enter
the source DSN privately (never in chat or command-line arguments):

```sh
read -rsp 'Source database read/operator URL: ' SOURCE_DATABASE_URL
export SOURCE_DATABASE_URL
corepack pnpm exec tsx scripts/prepare-render-judge.ts --export-sandbox /tmp/opencode/render-sandbox.json
unset SOURCE_DATABASE_URL
```

This transaction is read-only. It exports only the fixed fictional customer's one
historical purchase, not sessions, Sol grants, AI accounting or other tables.
Provider references become explicit archive pseudonyms; operation/session keys
are replaced with non-operational archive values, private origin/payee/approval
data are excluded. Receipt/event copies disclose sanitization and original dates.
It neither calls PayPal nor establishes a new verification. No mock Sandbox seed
is included in the application or deployment command.

## 2. Provision Render

1. Render Dashboard → **New → Blueprint** → `fmruslan/Pal-Care-Ruslan` →
   branch **main**, file **render.yaml**.
2. Review **palcare-judge** ($7/month compute) and **palcare-judge-postgres**
   ($6/month compute), plus database storage/usage. No Neon, worker or paid workspace
   upgrade is required. Authorize charges yourself.
3. Fill the prompted variables:
   - `CAREOS_API_KEY`: your dedicated DeepSeek key, privately.
   - `CAREOS_CUSTOMER_ACCESS_HASH`, `CAREOS_STUDIO_ACCESS_HASH`: generated hashes.
   - `APP_ORIGIN`: intended `https://<service-host>.onrender.com`, no slash. Correct
     it to Render's actual hostname if Render chooses a different one.
   - `DATABASE_URL`, `CAREOS_DATABASE_URL`, `CARE_DEMO_READER_DATABASE_URL`:
     temporarily `postgresql://pending:pending@pending.invalid/palcare`.
4. Click **Deploy Blueprint**. The database can provision while the web service
   initially remains **not ready**; this is expected until the next step. Never
   substitute the database owner URL into a web-service variable.

## 3. Populate only the new database

On the new Render PostgreSQL page → **Connections**, copy its internal and
external URLs privately. Temporarily allow only your operator's public IP under
**Networking → External Access**. Do not enable `0.0.0.0/0` access.

In the same private terminal:

```sh
read -rsp 'NEW Render external database URL: ' MIGRATION_DATABASE_URL
export MIGRATION_DATABASE_URL
read -rsp 'NEW Render internal database URL: ' RENDER_INTERNAL_DATABASE_URL
export RENDER_INTERNAL_DATABASE_URL
corepack pnpm exec tsx scripts/prepare-render-judge.ts --prepare-db /tmp/opencode/render-sandbox.json /tmp/opencode/render-runtime.env
unset MIGRATION_DATABASE_URL RENDER_INTERNAL_DATABASE_URL
```

Use TLS for external administration (append `sslmode=require` if absent; never
disable certificate verification). This command accepts only an empty Render
database named `palcare`, applies the existing reviewed root/Care/protection/demo/
consumer migrations, inserts the existing ten fictional purchases and historical
Sandbox copy, and provisions/verifies three restricted runtime connections. It
does not read `.env.local`, reset anything or print secrets. On a failure, stop and
diagnose that error; do not reset or rerun against a populated database.

Remove the temporary external-IP rule after setup. The web app uses internal
Render connections only. In **palcare-judge → Environment**, replace the three
pending URL values with the corresponding values from `render-runtime.env`.
Confirm the exact `APP_ORIGIN`. **Save, rebuild, and deploy** the CI-checked main
commit. Do not enter owner/migration/source DSNs, PayPal credentials, subscription
files or private GreatBison variables in the web service.

## 4. Personally test

Open the Render HTTPS URL in a fresh browser. Care, Purchases & Docs, documents and
Insights should work without private credentials/Tailscale. At `/ai-evaluation`,
select **North Star chat**, enter the customer access token, then select **AG Studio**
and enter its separate token. Return to Care (reload if previously open).

Check one purchase question, “How do I use Insights?”, and one explicit native
Studio action. Only actual state/data read-back establishes action success.
Share these access instructions/tokens privately with intended testers/judges;
do not publish the tokens in source or video. AI remains controlled, not anonymous.

Existing persistent API safeguards remain: six turns/minute and 30/hour per
conversation owner, 200 provider calls/hour, 500/day globally, at most two calls
per question, original $0.12 reservations and the existing $5 API budget ceiling.
These are reused protections, not a new budget framework or promise of unrestricted
public AI. Unknown usage stays reserved; no retries or automatic fallback.

Checkout, refunds, provider payment reads and workers stay disabled. Vendor
watermarks/notices remain intact; this change does not issue/activate a license
or claim additional entitlement. Keep hosting funded through December15,2026;
the owner-approved hosted access window ends January1,2027 at08:00UTC
(after all of December31,2026 Pacific time). This does not increase budgets,
credits or rate limits, change private Sol access, or automatically extend an
already-issued browser cookie; authorize the existing scope tokens again after
deployment if its browser access still has the earlier expiry. Actual hosted performance,
provider compatibility and owner acceptance must be verified after deployment.
