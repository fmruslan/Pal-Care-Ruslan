# Consumer Care polish — exact additive Demo-document decision

**Owner selected Approve after gates; applied after gates.** The exact SQL/manifest/operator/plan identities below added three fictional source documents after relevant tests, exact-commit CI, preservation and verified application rollback. [Execution evidence](evidence/CARE-CONSUMER-POLISH-RELEASE.md) records the source SHA, private deployment and limitations. No real financial or merchant operation is authorized.

## Exact new saved scope

Selected standard Drizzle lane `drizzle/consumer-care`, journal `drizzle.__care_consumer_migrations`, SQL `0020_consumer_demo_documents.sql`. **Three inserts into existing `documents`; no new table, migration of existing rows, role, credential, grant, worker, purchase, amount, retail reference or policy change.** The original `care-ten-v1` pack and every original source/receipt/history remain unchanged. Root 0016 remains pending.

| New document | Bound sample Twin | Fictional content |
| --- | --- | --- |
| `00000000-0000-4000-8000-000000001201` | Original sample headphones `…000201` | USD 149.00 purchase / USD 129.00 Demo catalog observation; USD 20.00 illustration, eligibility needs review, no adjustment or savings |
| `00000000-0000-4000-8000-000000001206` | Boots `…000206` | Demo return agreed November 1, parcel received November 4, inspection pending; no refund confirmed |
| `00000000-0000-4000-8000-000000001208` | Book `…000208` | USD 24.95 refund illustration dated November 4; expressly not issued or PayPal-verified, excluded from verified refunds/money recovered |

All are `kind=care-card`, `origin=sample`, with an explicit fictional-evidence preamble and typed `simulated=true` payload. Scenario date stays **2026-11-05T12:00:00.000Z**, independent of actual clocks/authority. The separate genuine Sandbox headphones purchase never inherits the sample's fictional price opportunity.

## Review identities

- SQL SHA-256: **`d27bf01685e1b424d5ef834e32f2433e1be932a368eb1b34715839633b72f63a`**.
- Three-document manifest SHA-256: **`0088e361009097c7da55bcd6b9c5b5d3f5c5ce46744e989b3b0fa6588a1ca054`**.
- Private migration helper SHA-256: **`4385f5902205d01ffd1bab003c9f1a428073003bc877fe2a982a9dbee588d7df`**.
- Plan/generator SHA-256: **`12db0b0716b3b4f8e0e6344633c609e1c0d3913d2cf5efc02bc25425c86df510`**.
- `pnpm exec tsx scripts/migrate-consumer-care.ts --print-proposal` is database-free. Hashes/flags are safeguards, not consent.

## Gate and rollback behavior

The data-only SQL requires the fixed fictional customer/merchant and existing sample Twins; ID/content conflicts abort the migration transaction. Repeating the reviewed lane is safe. Runtime `CARE_CONSUMER_SCENARIOS_ENABLED` defaults off, depends on the existing saved pack and uses the existing reader. Enabled reads require the exact saved source documents and sample purchase/amount bindings; missing/altered evidence fails visibly. It cannot synthesize database fallback data.

After approval and gates, apply only this lane, verify unchanged original rows/grants/journals/accounting, restart the old release against the additive documents, then enable the read-only flag and promote to existing private 8444. Rollback restores application assets/configuration only; it never deletes these documents or restores old data/credentials/authorization/accounting. No deadline/allowance renewal, public exposure or provider call follows from this packet.

**Owner decision recorded: Approve after gates.** Apply only the exact three-document scope above after verification. It authorizes no real return, shipment, refund, new PayPal operation, financial credential or new genuine-North browser.
