# ADR 0007: Proactive Price Guardian and once-only Sandbox refund intent

**Status:** Accepted for implementation/nonfinancial testing; external financial acceptance pending separate approval.

## Decision

Extend the Next.js modular monolith and existing pinned PayPal SDK. Add eleven Guardian/operator tables with reviewed additive migrations 0008/0009. Preserve all original purchase records. An immutable inactive `demo-price-v2` draft can be privately approved and bound only to future checkout with matching offer hash. Exact-product deterministic price-drop eligibility proposes one adjustment per capture, within 14 days and up to $20; customers do not initiate claims.

Separate short-lived CLI-issued operator capabilities from public dashboards and anonymous checkout. Require exact action/case scope, fresh approval and persistent limits. Independently gate provider reads and financial execution, with a restricted writer and one explicit case/capture/experiment budget. Persist intent/key/reservation before a single refund POST. Never automatically replay it. Reconciliation retrieves only; missing optional correlation leaves unknown operations blocked.

Keep original strict first-capture verification. Use a separate aftercare lifecycle validator accepting partially refunded historical captures. Only independently retrieved matching completed refund/capture evidence establishes a completed adjustment. Append history rather than rewrite receipts. Separate proposed, approved, pending, unresolved and verified amounts in read-only analytics for future AG Studio.

## Consequences

This deliberately favors stopping over duplicate financial dispatch. A crash before POST can leave a permanently reserved unknown operation; manual investigation, not automatic retry, is the tradeoff. Optional Orders refund records/correlation require actual Sandbox proof and may make unknown-ID recovery unavailable. External pending refunds cannot always be discovered; first release supports only an isolated controlled capture, not production multi-actor settlement. No webhook, continuous cloud scheduling, live AI or sponsor integration is introduced. [Full contract](../PRICE-GUARDIAN.md).
