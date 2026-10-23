import { describe, expect, it } from "vitest";
import { parseCheckoutConfig } from "../../src/lib/commerce/config";
import {
  boundedJson,
  requireSameOrigin,
  sessionHash,
  newSessionToken,
} from "../../src/lib/commerce/security";
import { startCheckoutSchema } from "../../src/lib/commerce/contracts";

describe("sandbox configuration and request boundaries", () => {
  it("fails closed without credentials or explicit enablement", () => {
    expect(parseCheckoutConfig({}).enabled).toBe(false);
    expect(
      parseCheckoutConfig({ PAYPAL_CHECKOUT_ENABLED: "true" }).enabled,
    ).toBe(false);
  });
  it("will not enable production, fixture mode, or an arbitrary HTTP origin", () => {
    const env = {
      PAYPAL_CHECKOUT_ENABLED: "true",
      PAYPAL_ENVIRONMENT: "sandbox",
      DEMO_DATA_SOURCE: "database",
      CHECKOUT_DATABASE_URL: "postgresql://localhost/unit_test",
      APP_ORIGIN: "https://palcare.example",
      PAYPAL_CLIENT_ID: "unit-only-not-a-credential",
      PAYPAL_CLIENT_SECRET: "unit-only-not-a-credential",
      PAYPAL_MERCHANT_ID: "TESTMERCHANT1",
    };
    expect(parseCheckoutConfig(env).enabled).toBe(true);
    for (const overrides of [
      { PAYPAL_ENVIRONMENT: "production" },
      { DEMO_DATA_SOURCE: "fixtures" },
      { APP_ORIGIN: "http://example.com" },
      { APP_ORIGIN: "https://palcare.example/redirect" },
    ])
      expect(parseCheckoutConfig({ ...env, ...overrides }).enabled).toBe(false);
  });
  it("requires exact Origin and JSON for mutations", () => {
    const origin = "https://palcare.example";
    expect(() =>
      requireSameOrigin(
        new Request(origin, {
          headers: { Origin: origin, "Content-Type": "application/json" },
        }),
        origin,
      ),
    ).not.toThrow();
    const invalidHeaders: Record<string, string>[] = [
      {},
      { Origin: "https://evil.example", "Content-Type": "application/json" },
      { Origin: origin, "Content-Type": "text/plain" },
      {
        Origin: origin,
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
      },
    ];
    for (const headers of invalidHeaders)
      expect(() =>
        requireSameOrigin(new Request(origin, { headers }), origin),
      ).toThrow();
  });
  it("stores only a SHA-256 digest of an unguessable anonymous session token", () => {
    const token = newSessionToken();
    expect(token).toHaveLength(64);
    expect(sessionHash(token)).toHaveLength(64);
    expect(sessionHash(token)).not.toBe(token);
    expect(() => sessionHash("guess")).toThrow();
  });
  it("does not accept visitor-supplied prices, currencies or merchant IDs", () => {
    expect(
      startCheckoutSchema.safeParse({
        productId: "00000000-0000-4000-8000-000000000101",
        requestId: crypto.randomUUID(),
        amount: 1,
      }).success,
    ).toBe(false);
  });
  it("rejects oversized actual bodies, including untrusted content-length", async () => {
    await expect(
      boundedJson(
        new Request("https://palcare.example", {
          method: "POST",
          body: "x".repeat(2049),
        }),
      ),
    ).rejects.toThrow("request_too_large");
    await expect(
      boundedJson(
        new Request("https://palcare.example", {
          method: "POST",
          body: "not-json",
        }),
      ),
    ).rejects.toThrow("invalid_request");
  });
});
