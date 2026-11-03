# North preview promotion and rollback — procedure, not activation

## Implemented / current boundary

The owner now explicitly authorizes promotion to **8444 → 127.0.0.1:3002**, after exact-commit CI, release-critical checks and startup-verified rollback. This supersedes the earlier approval stop, not the safety prerequisites. The **8445 → 3003** review remains separate, using the original shared policy/accounting. [STATUS](STATUS.md) records execution and actual acceptance; the 200-case campaign remains separate.

## Verified before any promotion

1. Record the exact tested source/build identity and genuine HTTPS customer outcomes: the three reported failures, natural follow-ups, scoped receipts/totals/charts, all-purchases ↔ exact product, source-backed care, honest missing data and navigation/history. Preserve failed attempts and unknowns. Add actual owner-device feedback; automation is supporting evidence, not customer acceptance.
2. Finish relevant isolated checks and exact-commit CI. Record human, provider, mobile-emulation and licensing limits; do not count injected/offline tests as genuine cases or silently move them into the frozen 200-case campaign.
3. Prepare and test an **8444-specific configuration** for the accepted conversational code. The current 8445 live-review configuration is exact-origin gated, not a drop-in server to proxy behind 8444. Verify Host/Origin, native presentation, browser identity and original shared policy/usage on the intended origin. Do not rewrite Host headers or proxy protected model requests to fake another origin.
4. Obtain the owner's explicit main-preview replacement decision after reviewing the customer evidence and remaining gates. No new cap, session renewal, paid fallback, migration or license activation follows from that decision.

**Current rollback prerequisite:** the startup workspace check already reports **primary build/source mismatch** while the original PID continues serving its retained assets. Therefore “restart the old primary checkout” is **not a verified rollback**. Before stopping 8444, reconstruct/retain and startup-verify a matching original source/build/8444-launcher snapshot in an approved isolated location, without resetting the primary checkout or discarding working changes. If that matching rollback cannot be established, **do not stop/promote the main preview**. Do not weaken provenance/startup guards to make rollback appear to work.

## Bounded replacement after separate approval

1. Capture private before-receipts: original service unit/launcher and source pointer, original build identity/assets, listener mappings, runtime flags, original policy/event prefix and browser/session deadlines. Do not publish readable deployment credentials or copy secrets into Git.
2. Keep the original build and source intact for rollback. Build a separate frozen release snapshot; verify its identity, dependency symlinks, restricted reader/CareOS authority and financial-off configuration before touching the running original service. Never build over live `.next` assets.
3. Stop **only** `palcare-preview.service`; point its approved launcher/configuration to the verified **8444-specific** release snapshot; start it on **127.0.0.1:3002**. Leave Tailscale 8444 → 3002, 8445, OpenCode 8443, every other mapping and Funnel-off unchanged.
4. Repeat focused actual **8444 HTTPS** acceptance, including an actually authorized browser, missing-access fallback, linked records/totals/native read-back, product care, reload/navigation and preservation. A pre-promotion 8445 result is not post-promotion proof. Reserve/count any necessary provider call normally; never replay an uncertain request.

## Rollback / stop conditions

- If startup, authority, source identity, actual customer outcomes or preservation fail, stop only the changed main service and restore its **original launcher/source/build pointer and non-secret runtime configuration**, then restart the retained original assets on 3002. Confirm original HTTPS readiness and intended old interface. The separate 8445 preview can remain available or be stopped independently.
- **Never roll back owner accounting, provider tokens/registration, application data, purchase evidence, session timestamps or ledgers.** New completed/failed/unknown attempts remain charged. Keep the latest legitimate rotated provider credential; restoring an older token can break rotation. No database reset/migration is part of app rollback.
- Provider denial, exhausted quota, uncertain refresh/dispatch, expired/revoked browser or missing origin approval blocks further inference. Stop and report the exact blocker; do not renew scopes, reset budgets, rotate identities or buy credits to make acceptance green.

## Incomplete / Blocked / Next

Main-preview replacement is **not executed**. Owner-device acceptance, exact accepted-commit CI, validated 8444-specific conversational activation and a proven matching original rollback snapshot remain prerequisites. The actual 8445 customer journeys/results are in [current evidence](evidence/NORTH-CONVERSATIONAL-AI.md). Next: owner hands-on feedback, then the exact main-preview decision and missing cutover verification; no invented engineering date or silent promotion.
