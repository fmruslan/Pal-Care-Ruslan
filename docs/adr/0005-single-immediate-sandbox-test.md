# ADR 0005: One conditionally approved immediate-payment Sandbox test

**Status:** Accepted implementation; no provider order authorized until tests pass and the buyer confirms sufficient Sandbox USD balance.
**Date:** 2026-10-22

## Scope

The user approved exactly one **separate** USD 129.00 Everyday headphones purchase. The existing pending eCheck must not be modified, recaptured, cancelled, refunded, re-funded or relabeled. PayPal's documented `payment_source.paypal.experience_context.payment_method_preference: IMMEDIATE_PAYMENT_REQUIRED` is appropriate for the new experiment, not for clearing the earlier capture. It permits balance, cards and instant ACH; it is not a balance-only switch or completed-payment proof. The buyer must explicitly select **PayPal balance**, not a checking account, eCheck or alternate source, and stop if it is unavailable/insufficient.

## Decision

- Add one nullable, constrained `payment_method_preference` snapshot to new checkout records using reviewed migration 0005. No default or historical backfill; legacy rows remain null and their entire SDK create payload continues to omit the preference.
- Configure one server-only request UUID and the originating browser's existing session digest. Bind new creation to that exact pair, the fixed headphones SKU and USD 129.00 trusted catalog price. No visitor-supplied preference, confirmation flag, amount or merchant is accepted.
- The operator's balance-confirmation flag starts **false**. In this scoped mode, new creation is rejected before insertion/provider calls until the user confirms available USD balance. Shop buttons remain disabled. Balance confirmation is a user-reported precondition, not backend knowledge of the wallet or payment proof.
- After confirmation and a process restart with the same scope, only that browser's headphones button is eligible and uses the reserved request UUID. The existing global request uniqueness, advisory creation lock, provider leases, quotas and persisted create/capture keys enforce one new checkout despite clicks/reloads/concurrent requests. A different request, browser, product or changed price is rejected.
- Snapshot the immediate preference before calling PayPal. Creation retries use the stored preference, keys, snapshot and deadline even if runtime configuration later changes. Never globally alter the payload for existing idempotent operations.
- Preserve exact Origin/cookie/JSON boundaries, Sandbox-only SDK, attempted-capture marker, provider retrieval, pinned capture identity and atomic verified Twin/receipt/policy/event insertion. Unexpected pending, declined or mismatched results are not bypassed to make the test succeed.
- No operator-grant HTTP endpoint, customer login, new checkout UI design or generic payment-method selector is introduced. Operator scope/configuration stays private and consistent across any serving processes; do not mix scoped/unscoped processes during the controlled experiment.

## Acceptance evidence

Offline payload tests compare the full legacy body, not just the absence of one field. Dedicated PostgreSQL tests cover unconfirmed balance, wrong browser/request/SKU/price, persisted preference before dispatch, duplicate/concurrent creation, lost cookies, retry across configuration changes and separate old-pending/new-completed records. Outcome fixtures remain test doubles, not live evidence.

Before creating the real test order, finish quality/regression checks, preserve a read-only baseline of the old checkout, apply migration 0005 without changing its existing fields, start the new scope unarmed, and obtain explicit balance confirmation. No order, buyer approval or completed capture is claimed by this ADR.

See [controlled-test procedure](../PAYPAL.md#one-separate-immediate-payment-test) and the [official Orders v2 schema](https://developer.paypal.com/api/orders/v2/schema.json).
