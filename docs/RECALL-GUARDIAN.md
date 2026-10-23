# Recall Guardian — official evidence, conservative identity

## Implemented scope

`/safety` displays **one reviewed historical official CPSC notice**, recall **24-159 / API ID 9892**, concerning specified Insignia air fryers/ovens. `/safety?example=insignia` adds a **fictional ownership example**: it is not a PayPal purchase, not seeded as a verified Twin, and not a verified physical product identity. The existing Forma/Hearth purchases are never assigned an invented recall. The Raspberry Pi reference is not borrowed as recall evidence for unrelated products.

The public CPSC API was actually retrieved and its official HTML notice separately reviewed. `pnpm cpsc:verify` passed with matching reviewed revision at **2026-10-23T05:34:34.139Z**. Selected source SHA-256:

`3c0615328acfa6a6b718d72ec89f221d92e8be41e2205728b908ea55ad2455c9`

An explicitly enabled local `cpsc:refresh` also passed at **2026-10-23T05:54:02.874Z**, storing this official source and one scoped assessment of the pre-existing verified fictional purchase. That assessment is a limited **no-match**, not a safety certification. No checkout, receipt, policy, capture, Guardian or purchase-event row is updated by this service.

## Honest matching

The source/model mapping was reviewed by the coding agent against the actual API and official page. This is not a claim of independent human safety review, user testing or physical-product inspection.

The structured API `Products[].Model` was empty in the actual response. Six model IDs were explicitly reviewed against the notice's description and official page; they were not guessed from a product title or optional field. Rules are bound to the reviewed source fingerprint. A changed source returns **not assessed** until its applicability is reviewed.

States distinguish not assessed, possible match, identifiers match, more information and no match. Brand/model normalization only normalizes Unicode, casing and surrounding whitespace; it does not perform fuzzy name confirmation. Matching a saved sample model never verifies the physical item. Every serial/date/batch restriction must be independently validated; merely providing a value is insufficient. Current stored purchase assessments always leave physical identifier verification false. No-match explicitly means **this limited notice did not match**, never “no recalls exist” or “safe to use”.

The Twin section and unified purchase activity link evidence with bounded saved history. CareOS uses deterministic scoped explanations; it cannot manufacture recall status, prescribe repairs or authorize refunds. Safety/replacement navigation preserves a saved Twin or the explicit Insignia example; server-derived category mapping prevents unrelated headphones being shown for an air-fryer handoff.

## Sources and persistence

- Exact endpoint: `https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=24159`.
- Official page: https://www.cpsc.gov/Recalls/2024/Best-Buy-Recalls-Insignia-Air%20Fryers-and-Air-Fryer-Ovens-Due-to-Fire-Burn-and-Laceration-Hazards
- Publisher: U.S. Consumer Product Safety Commission. Selected notice text is attributed; no manufacturer/CPSC logos or product photographs copied. Do not assume every third-party asset on a government page has the same reuse rights.
- Bounded JSON parsing, exact recall-number check, a single accepted result, fixed official HTTPS hosts, no redirect following, 12-second timeout and 1 MB response limit.
- `recall_sources` keeps immutable selected source revisions; `recall_assessments` appends one decision per Twin/source/engine. `recall_checks` records the latest attempt and retains the last source when a refresh fails.
- Additive reviewed migrations 0010/0011; original financial tables/constraints untouched. New evidence cannot be overwritten through UPDATE.
- Bundled official snapshots are explicitly identified when no stored retrieval exists. An actual database error is not converted into a sample fallback. Last retrieval/attempt and limited scope remain distinct from continuous monitoring.

## Operator commands

```bash
pnpm cpsc:verify                    # Free official provider GET, no DB writes
CPSC_REFRESH_ENABLED=true pnpm cpsc:refresh  # Private CLI; writes recall tables only
```

Refresh requires an explicit restricted `RECALL_DATABASE_URL` in the separately authorized private ingestion environment, verified before the source GET; it never uses the web reader/owner fallback. It commits up to 20 batches of 100 unassessed Twin/source/engine records per invocation, returns `remaining`, resumes after interruption and includes later UUIDs behind a previous cursor. A successful source retrieval is not proof that all assessments completed. The default remains off; no public refresh route, paid service or cloud schedule exists. Broad API filters must not be assumed correct. Comprehensive CPSC coverage remains out of scope.

For the recalled models the official notice says stop using the product. Pal Care attributes the official remedy and links the notice; it does not provide DIY destruction/repair instructions or establish entitlement to a manufacturer refund. Existing PayPal refund approval is unrelated.

Tests cover wrong/similar models, missing/physical identifiers, changed sources, serial/date restrictions, unsafe URLs, mismatched/multiple API records, immutable hashes, idempotent ingestion, failure retention and financial-record preservation. Actual retrieval is separate evidence from injected-response tests.
