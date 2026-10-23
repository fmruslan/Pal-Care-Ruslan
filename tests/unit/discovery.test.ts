import { describe, it, expect } from "vitest";
import { discoveryConfig } from "../../src/lib/discovery/contracts";
import {
  Channel3Gateway,
  normalizeProduct,
  safeOfferUrl,
  priceMinor,
} from "../../src/lib/discovery/provider";
import { illustrativeAlternatives } from "../../src/lib/discovery/fixtures";
const offer = {
  url: "https://www.buy.trychannel3.com/example",
  domain: "bestbuy.com",
  price: { price: 129.99, currency: "USD" },
  availability: "InStock",
  condition: "new",
};
const product = {
  id: "PRODUCT_TEST_1",
  title: "Example headphone",
  brands: [{ name: "Test brand" }],
  offers: [offer],
  category: { title: "Headphones" },
};
describe("Channel3 infrastructure is not fictional live commerce", () => {
  it("does not inherit activation from checkout/model flags or guess free credit approval", () => {
    expect(discoveryConfig({ PAYPAL_CHECKOUT_ENABLED: "true" }).enabled).toBe(
      false,
    );
    expect(() => discoveryConfig({ CHANNEL3_LIVE_ENABLED: "true" })).toThrow();
    const env = {
      CHANNEL3_LIVE_ENABLED: "true",
      CHANNEL3_FREE_CREDITS_CONFIRMED: "true",
      CHANNEL3_API_KEY: "TEST_ONLY_KEY",
      CHANNEL3_BUDGET_ID: "unit",
      CHANNEL3_MAX_SEARCHES: "1",
      DISCOVERY_DATABASE_URL: "postgresql://localhost/placeholder_test",
    };
    expect(discoveryConfig(env).enabled).toBe(true);
    expect(() =>
      discoveryConfig({ ...env, CHANNEL3_MAX_SEARCHES: "11" }),
    ).toThrow();
  });
  it("keeps sample profiles unpriced and unlinked", () => {
    for (const f of illustrativeAlternatives("headphones")) {
      expect(f.provenance).toBe("illustrative");
      expect(f.href).toBeNull();
      expect(f.amountMinor).toBeNull();
      expect(f.checkedAt).toBeNull();
    }
  });
  it("uses integer-minor USD offers and rejects ambiguous pricing", () => {
    expect(priceMinor(129.99)).toBe(12999);
    expect(priceMinor(20.1)).toBe(2010);
    for (const n of [NaN, -1, 0, 1.001, Infinity])
      expect(() => priceMinor(n)).toThrow();
    expect(
      normalizeProduct(product, "headphones", "2026-10-23T00:00:00Z")[0]
        .amountMinor,
    ).toBe(12999);
    expect(
      normalizeProduct(
        {
          ...product,
          offers: [
            { ...offer, price: { price: 129, amount: 130, currency: "USD" } },
          ],
        },
        "headphones",
        "",
      ),
    ).toEqual([]);
  });
  it("rejects unsafe retailer/provider links and credentials in URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://bestbuy.com/p",
      "https://bestbuy.com.evil.example/p",
      "https://user:pass@bestbuy.com/p",
      "https://127.0.0.1/private",
    ])
      expect(safeOfferUrl(url, "bestbuy.com")).toBeNull();
    expect(
      safeOfferUrl("https://www.bestbuy.com/p", "bestbuy.com"),
    ).toBeTruthy();
    expect(safeOfferUrl(offer.url, "unknown.example")).toBeNull();
  });
  it("refilters every offer, not merely a matching product; excludes known recalled model tokens", () => {
    expect(
      normalizeProduct(
        { ...product, category: { title: "Speakers" } },
        "headphones",
        "",
      ),
    ).toEqual([]);
    expect(
      normalizeProduct({ ...product, category: null }, "headphones", ""),
    ).toEqual([]);
    for (const change of [
      { availability: "OutOfStock" },
      { condition: null },
      { condition: "used" },
      { price: { price: 250, currency: "USD" } },
      { price: { price: 100, currency: "EUR" } },
    ])
      expect(
        normalizeProduct(
          { ...product, offers: [{ ...offer, ...change }] },
          "headphones",
          "",
        ),
      ).toEqual([]);
    expect(
      normalizeProduct(
        {
          ...product,
          title: "Insignia NS-AF34D2 Air Fryer",
          category: { title: "Air Fryers" },
        },
        "air-fryer",
        "",
      ),
    ).toEqual([]);
  });
  it("uses a fixed authenticated endpoint, bounded result count and no automatic API retries", async () => {
    let calls = 0;
    const gateway = new Channel3Gateway("TEST_ONLY", async (url, init) => {
      calls++;
      expect(String(url)).toBe("https://api.trychannel3.com/v1/search");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("TEST_ONLY");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        limit: 3,
        config: { mode: "keyword", currency: "USD" },
      });
      return new Response("{}", { status: 429 });
    });
    await expect(gateway.search("headphones")).rejects.toThrow(
      "channel3_http_429",
    );
    expect(calls).toBe(1);
  });
});
