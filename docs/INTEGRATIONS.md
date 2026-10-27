# Integration contracts and sponsor strategy

PayPal checkout has actual Stage 2 completed-capture/Twin evidence; the separate pending eCheck is preserved. Price Guardian is implemented with actual refund acceptance deferred. The continuation uses actual local AG Studio and scripted SDK tools plus one verified official CPSC retrieval; Channel3 and hosted models remain fixture-tested/unverified externally. Public licensing, webhooks and Render deployment are incomplete. Track [continuation evidence](evidence/CONTINUATION-VERIFICATION.md), [payment evidence](evidence/STAGE2-VERIFICATION.md) and [status](STATUS.md). Never commit real credentials.

| Provider | Use / evidence boundary | Reference |
| --- | --- | --- |
| PayPal Sandbox | Actual completed Orders/Payments capture and automatic Twin verified via official SDK 2.5.0; refunds/webhooks deferred | https://developer.paypal.com/ |
| Official PayPal Next.js starter | Trusted checkout reference | https://developer.paypal.com/guides/nextjs-checkout |
| PayPal Postman workspace | Create/capture/refund/error testing | https://www.postman.com/paypal |
| Hosted AI model API | Official Responses/Zod adapter targets only `gpt-6.1-sol` / medium; shared bounded customer/Studio budgets and isolated protocol tests; actual project access/inference await separate approval/key | [CareOS contract](CAREOS.md); [capped acceptance and API-project setup](AI-EVALUATION.md) |
| Render Managed PostgreSQL + Drizzle | Sample records, reviewed migrations and idempotent seed implemented locally; cloud deployment pending | https://render.com/docs/databases |
| CPSC | Actual retrieved historical notice 24-159, pinned exact-model rules, limited coverage/physical-identity uncertainty | [Recall contract](RECALL-GUARDIAN.md) |
| Channel3 | Real adapter/fresh-offer infrastructure + labeled fixture UX; actual API acceptance pending credentials/free-credit authorization | [Discovery contract](REPLACEMENT-CONCIERGE.md) |
| AG Studio | Actual 3.0.0 local components, three custom widgets, shared SDK page filters and scripted tools; hosted AI/public license coverage pending | [Contract](INTELLIGENCE.md) · https://paypalaihackathon.devpost.com/details/aggrid |
| Render | Hosting and background tasks | https://render.com/docs |
| APIMatic (optional) | PayPal API context in coding assistant | https://paypalaihackathon.devpost.com/resources |

## Engineering boundaries

Continuation truth: actual AG Studio 3.0.0 components/custom widgets and scripted SDK tools are locally verified, not hosted AI/public license coverage. One historical CPSC notice is genuinely retrieved and reviewed, not comprehensive continuous monitoring. Channel3 has an injected-transport-tested real REST adapter and fixture UX; **no actual Channel3 call is verified**, so sponsor qualification is not claimed. Price Guardian financial acceptance and genuine CareOS/Studio inference remain the highest-priority external proof gates. [Verification ledger](evidence/CONTINUATION-VERIFICATION.md).

- Refund execution must be authorized server-side, never delegated directly to AI or a dashboard agent.
- PayPal purchase and refund evidence must come from actual Sandbox responses, not a mocked state.
- Price-change replay must be clearly labeled as a controlled test scenario while exercising real application domain rules; it is not production certification.
- A recall candidate must cite an official source and support confirming the product model before asserting it is affected.
- Channel3 cards must use real returned product identity and approved outgoing retailer links.
- Recorded dashboard figures derive from stored records. Explicit illustrative scenarios remain separate and never imply actual business outcomes or enter financial tables.
- Missing external API data must fail gracefully with an appropriate timestamp and source label.

## Sponsor prize emphasis

AG Studio is the highest-value cash sponsor target. Channel3 provides a relevant commerce component. APIMatic is optional if OpenCode compatibility and real use are proven. Multiple integrations do not permit winning multiple sponsor prizes under the hackathon's award limits.
