# Render judge setup

Hosted-only DeepSeek Flash uses the existing Responses SDK, North conversations,
grounding, strict plans and native Studio execution. GreatBison/Sol is not deployed
or reconfigured. Hosted visitors automatically receive separate signed, expiring
customer/Studio guest cookies on their first explicit North/Studio request. No
login, token entry or `/ai-evaluation` setup; that hosted page redirects to Care.
The DeepSeek key stays on Render and signs domain-separated capabilities; only
HttpOnly/Secure/Strict host-only cookies reach the browser. Cookies expire within
24 hours or the configured hosted deadline, whichever comes first. Existing
valid cookies are not rotated or extended by admission. This does not grant
private Sol, purchase-write, operator or financial access.

## 1. Prepare the genuine historical copy (operator-only, already completed)

Run from the checked-out final `main`, using a private terminal. Files below must
stay outside Git; do not post their contents or screen-record them.

The original `--access` helper and manual hashes are historical; hosted guest
mode no longer uses or requires them. Do not repeat database preparation on the
working populated deployment.

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
Insights should work without private credentials/Tailscale. Click **Explore with
North ☆**, ask a question and request a chart in Insights; no setup page.

Check one purchase question, “How do I use Insights?”, and one explicit native
Studio action. Only actual state/data read-back establishes action success.
Two browser contexts must have distinct conversation ownership and cannot read
or mutate each other's histories, even with a known conversation UUID.

Existing persistent API safeguards remain: six turns/minute and 30/hour per
conversation owner, 200 provider calls/hour, 500/day globally, at most two calls
per question and original $0.12 reservations. The owner-approved hosted ceiling is
**$18 daily/total**, leaving $2 of the stated $20 credits outside the application
cap. Existing Render settings equal to the legacy $5 ceiling resolve to $18 in
hosted mode; other explicit limits remain enforced. The Blueprint uses $18.
The original `render-judge` ledger ID, historical usage and unknown reservations
remain unchanged. `GET /api/ai/evaluation` exposes only aggregate budget/window
and current-scope status, never credentials or other visitors' histories.
These are reused protections, not a new budget framework or promise of unrestricted
public AI. Unknown usage stays reserved; no retries or automatic fallback.

Checkout, refunds, provider payment reads and workers stay disabled. Vendor
watermarks/notices remain intact; this change does not issue/activate a license
or claim additional entitlement. Keep hosting funded through December15,2026;
the owner-approved hosted access window ends January1,2027 at08:00UTC
(after all of December31,2026 Pacific time). This does not purchase more credits,
reset usage, change private Sol access, or increase rate limits. Exhausted funds,
limits or provider failures remain explicit unavailable states, not paid fallback.
The JSON-object compatibility release reached the provider but did not pass strict
application validation. The constrained-output candidate retains structural
schema enforcement while moving unsupported length/item/date grammar
constraints to trusted descriptions; the ORIGINAL strict server-side Zod,
grounding and action checks still enforce every application rule. Hosted preflight
and dispatch share the exact body builder under the original 20 KB cap. No
automatic retry or alternate provider is enabled; actual acceptance is in STATUS.
Actual hosted performance,
provider compatibility and owner acceptance must be verified after deployment.
