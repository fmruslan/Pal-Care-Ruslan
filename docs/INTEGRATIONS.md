# Integration contracts and sponsor strategy

PayPal checkout is implemented and independently tested. **The separately approved immediate-payment case has actual completed Orders/Payments capture evidence and exactly one durable Twin/receipt/policy/event. Repeated read-only verification passed without duplicates; Stage 2's bounded purchase/Twin slice is complete.** The separate eCheck remains preserved and is not claimed cleared. AI/sponsor integrations and webhooks remain planned. Local PostgreSQL works; Render hosting is unverified. Track [acceptance evidence](evidence/STAGE2-VERIFICATION.md) and [Implementation Status](STATUS.md). Never commit real credentials.

| Provider | Planned use | Reference |
| --- | --- | --- |
| PayPal Sandbox | Actual completed Orders/Payments capture and automatic Twin verified via official SDK 2.5.0; refunds/webhooks deferred | https://developer.paypal.com/ |
| Official PayPal Next.js starter | Trusted checkout reference | https://developer.paypal.com/guides/nextjs-checkout |
| PayPal Postman workspace | Create/capture/refund/error testing | https://www.postman.com/paypal |
| Hosted AI model API | Official OpenAI Responses adapter implemented with Zod and persistent resource gates; fixture mode verified, actual runtime inference awaiting separate approval/key | [CareOS contract](CAREOS.md); initial transport-tested candidate `gpt-5.4-mini-2026-03-17` |
| Render Managed PostgreSQL + Drizzle | Sample records, reviewed migrations and idempotent seed implemented locally; cloud deployment pending | https://render.com/docs/databases |
| CPSC | Official U.S. recall data | https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information |
| Channel3 | Real replacement product search, prices and links | https://paypalaihackathon.devpost.com/resources |
| AG Studio | Actual 3.0.0 local-evaluation component, three custom widgets and data-engine cross-filtering; hosted AI/public license coverage pending | [Contract](INTELLIGENCE.md) · https://paypalaihackathon.devpost.com/details/aggrid |
| Render | Hosting and background tasks | https://render.com/docs |
| APIMatic (optional) | PayPal API context in coding assistant | https://paypalaihackathon.devpost.com/resources |

## Engineering boundaries

- Refund execution must be authorized server-side, never delegated directly to AI or a dashboard agent.
- PayPal purchase and refund evidence must come from actual Sandbox responses, not a mocked state.
- Price-change replay must be clearly labeled as a controlled test scenario while exercising production business rules.
- A recall candidate must cite an official source and support confirming the product model before asserting it is affected.
- Channel3 cards must use real returned product identity and approved outgoing retailer links.
- Dashboard figures must derive from actual stored test records, not fabricated business metrics.
- Missing external API data must fail gracefully with an appropriate timestamp and source label.

## Sponsor prize emphasis

AG Studio is the highest-value cash sponsor target. Channel3 provides a relevant commerce component. APIMatic is optional if OpenCode compatibility and real use are proven. Multiple integrations do not permit winning multiple sponsor prizes under the hackathon's award limits.
