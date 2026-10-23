# Replacement Concierge and Channel3 infrastructure

## Current truth

`/replacements` is an implemented care-first comparison experience, with headphones and air-fryer categories. Default **fixture** mode shows fictional comparison profiles, **no market prices, availability claims, retailer links or fabricated Channel3 products**. CareOS can navigate the supported headphones workspace; unsupported Twin categories remain unsupported rather than receiving unrelated replacements. Official recall remedy/stop-use guidance takes priority over shopping.

A real server-side Channel3 REST adapter and fresh-offer display path are implemented and tested with injected transport/PostgreSQL. **Actual Channel3 credentials and provider acceptance are not configured or verified.** This does not yet qualify as actual API use for the sponsor prize.

## Actual API support

Products must also have an explicitly supported structured category title. Unknown or mismatched categories produce no accepted offers rather than unrelated recommendations. This conservative mapping is fixture-tested and must be checked against actual provider records during future acceptance; no guessed live-category compatibility is claimed.

The adapter uses documented fixed endpoints `POST https://api.trychannel3.com/v1/search` and `GET /v1/products/{id}` with server-only `x-api-key`. Two fixed server-owned queries use US/USD, keyword mode, at most three selected product IDs, explicit new/in-stock constraints and category budgets ($200 headphones / $180 air fryer). No arbitrary user URL, user identity header, autonomous agentic search or external checkout.

Each returned offer is re-filtered: a product matching a search does not imply all its offers match. USD decimal amounts become integer minor units; malformed/ambiguous prices, unknown/used condition, out-of-stock, over-budget and unsafe links are excluded. Both documented `price.price` and `price.amount` forms are accepted only when consistent. Known model tokens from the reviewed Insignia notice are conservatively excluded; this is **not comprehensive recall screening or compatibility certification**.

Outgoing HTTPS links are limited to approved retailer domains or documented Channel3 buy-link hosts, with an allowlisted retailer identity. No credentials, arbitrary ports, non-HTTPS links or deceptive subdomains are accepted. Buy links may be attributed; display discloses this and ranking does not use commission. A provider link is not proof of the final retailer's availability/checkout terms.

Only product IDs/category/discovery time persist in `discovery_products`; volatile prices, stock and offer URLs are retrieved fresh before display. `discovery_usage` atomically reserves a stable credit budget before search dispatch. Unknown/failed calls retain reservations and are never automatically retried. Search is private CLI only, not a public credit-spending endpoint. The optional public provider view retrieves only curated IDs using documented free product-detail reads, capped at 100/day. Exhaustion/failure is visible, never silently replaced by fixture offers. Transport has a 12-second timeout, no retries/redirects and a 1 MB streamed-response limit.

## Activation — owner action required, not performed

1. Obtain a Channel3 hackathon account/key and verify the account has free credits and no paid overage enabled. Do not expose the key to the browser, Git or screenshots.
2. After separate approval, apply the current reviewed migration baseline through 0015 and privately configure a least-privilege login based on `scripts/discovery-role.sql`. Shared preflight checks actual login/effective/assumable roles, ownership, table/column privileges, PUBLIC TEMP and required discovery grants. It cannot read private conversation/operator tables or write trusted purchase/Guardian/recall evidence. A SQL template is not actual environment verification.
3. Only after separate credential/credit authorization, configure `CHANNEL3_LIVE_ENABLED=true`, `CHANNEL3_FREE_CREDITS_CONFIRMED=true`, `CHANNEL3_API_KEY`, `DISCOVERY_DATABASE_URL`, stable `CHANNEL3_BUDGET_ID` and `CHANNEL3_MAX_SEARCHES` (1–10). Never rotate the budget to bypass exhaustion. No billing/MPP fallback exists.
4. Run `pnpm channel3:verify headphones` (or `air-fryer`) for one bounded search plus fresh product retrieval. Sanitized output reports accepted offers; failure/zero accepted results is not success. This command has **not been executed against Channel3**.
5. Set `DISCOVERY_PROVIDER=channel3` only after verification to display fresh curated results. Keep `fixture` otherwise. A configured real-provider failure is not a fixture fallback.

The sponsor advertises promotional free credits, but an account-specific grant is not assumed. No signup, promotion redemption, subscription, paid call or price tracking was activated. Tests/CI force fixture mode and blank provider keys.

## Official references

- [Sponsor requirements — actual API/MCP use required](https://paypalaihackathon.devpost.com/details/channel3)
- [Search API](https://docs.trychannel3.com/api-reference/v1/search.md)
- [Offer semantics](https://docs.trychannel3.com/guides/offer.md)
- [Cache IDs, refresh offers](https://docs.trychannel3.com/guides/caching.md)
- [Pricing](https://docs.trychannel3.com/pricing.md)
