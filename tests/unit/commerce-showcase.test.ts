import { describe, it, expect } from "vitest";
import {
  assertShowcaseScope,
  SHOWCASE_REQUEST_ID,
  SHOWCASE_PRODUCT_ID,
  SHOWCASE_AMOUNT_MINOR,
  showcaseScopeSchema,
  type ShowcaseScope,
} from "../../src/lib/commerce/showcase";
import { parseCheckoutConfig } from "../../src/lib/commerce/config";
import { privatePreviewEnvironment } from "../../scripts/private-preview-policy";
import { readinessPlan } from "../../src/lib/readiness-plan";
import { privateHttpsOrigin } from "../../src/lib/private-preview-origin";

const scope: ShowcaseScope = {
  requestId: SHOWCASE_REQUEST_ID,
  sessionHash: "a".repeat(64),
  balanceConfirmed: true,
  startsAt: "2026-11-05T12:00:00Z",
  endsAt: "2026-11-05T14:00:00Z",
};
const input = {
  requestId: SHOWCASE_REQUEST_ID,
  productId: SHOWCASE_PRODUCT_ID,
  sessionHash: scope.sessionHash,
  amountMinor: SHOWCASE_AMOUNT_MINOR,
};
const now = Date.parse("2026-11-05T13:00:00Z");
describe("separately approved single Sandbox showcase", () => {
  it("private readiness permits only the exact bounded main-origin showcase, never general checkout or another financial flag", () => {
    const source = {
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader@127.0.0.1/app",
      CAREOS_DATABASE_URL: "postgresql://careos@127.0.0.1/app",
      PAYPAL_CHECKOUT_ENABLED: "true",
      PAYPAL_ENVIRONMENT: "sandbox",
      CHECKOUT_DATABASE_URL: "postgresql://checkout@127.0.0.1/app",
      PAYPAL_CLIENT_ID: "fixture-id",
      PAYPAL_CLIENT_SECRET: "fixture-secret",
      PAYPAL_MERCHANT_ID: "TESTMERCHANT1",
      PAYPAL_SHOWCASE_ENABLED: "true",
      PAYPAL_SHOWCASE_REQUEST_ID: SHOWCASE_REQUEST_ID,
      PAYPAL_SHOWCASE_SESSION_HASH: scope.sessionHash,
      PAYPAL_SHOWCASE_BALANCE_CONFIRMED: "false",
      PAYPAL_SHOWCASE_STARTS_AT: scope.startsAt,
      PAYPAL_SHOWCASE_ENDS_AT: scope.endsAt,
    };
    const env = privatePreviewEnvironment(source, null, null);
    expect(env.APP_ORIGIN).toBe(privateHttpsOrigin);
    expect(env.PAYPAL_CHECKOUT_ENABLED).toBe("true");
    expect(env.PAYPAL_SHOWCASE_BALANCE_CONFIRMED).toBe("false");
    expect(readinessPlan(env).requirements.map((r) => r.capability)).toEqual([
      "reader",
      "careos",
      "checkout",
    ]);
    for (const change of [
      { PAYPAL_SHOWCASE_ENABLED: "false" },
      { PAYPAL_SHOWCASE_REQUEST_ID: "00000000-0000-4000-8000-000000000999" },
      { GUARDIAN_REFUNDS_ENABLED: "true" },
      { CHECKOUT_DATABASE_URL: "postgresql://checkout@remote/app" },
    ])
      expect(() => readinessPlan({ ...env, ...change })).toThrow();
    expect(() =>
      privatePreviewEnvironment(
        { ...source, PAYPAL_ENVIRONMENT: "production" },
        null,
        null,
      ),
    ).toThrow();
  });
  it("allows only the exact reserved request/product/session/amount in its window", () =>
    expect(() => assertShowcaseScope(scope, input, now)).not.toThrow());
  it.each([
    { productId: "00000000-0000-4000-8000-000000000101" },
    { requestId: "00000000-0000-4000-8000-000000000999" },
    { sessionHash: "b".repeat(64) },
    { amountMinor: 5699 },
  ])("rejects a substituted identity/retail amount: %j", (change) =>
    expect(() =>
      assertShowcaseScope(scope, { ...input, ...change }, now),
    ).toThrow("sandbox_test_not_authorized"),
  );
  it("requires actual buyer balance confirmation and never creates a new scope", () => {
    expect(() =>
      assertShowcaseScope({ ...scope, balanceConfirmed: false }, input, now),
    ).toThrow();
    expect(() => assertShowcaseScope(undefined, input, now)).toThrow();
  });
  it("enforces inclusive start/exclusive end and maximum two-hour authority", () => {
    expect(() =>
      assertShowcaseScope(scope, input, Date.parse(scope.startsAt)),
    ).not.toThrow();
    expect(() =>
      assertShowcaseScope(scope, input, Date.parse(scope.startsAt) - 1),
    ).toThrow();
    expect(() =>
      assertShowcaseScope(scope, input, Date.parse(scope.endsAt)),
    ).toThrow();
    expect(
      showcaseScopeSchema.safeParse({
        ...scope,
        endsAt: "2026-11-05T14:00:01Z",
      }).success,
    ).toBe(false);
  });
  it("cannot activate through an incomplete or competing legacy scope", () => {
    expect(
      parseCheckoutConfig({
        PAYPAL_CHECKOUT_ENABLED: "false",
        PAYPAL_SHOWCASE_ENABLED: "true",
      }).enabled,
    ).toBe(false);
    const env = {
      PAYPAL_CHECKOUT_ENABLED: "true",
      PAYPAL_ENVIRONMENT: "sandbox",
      APP_ORIGIN: "http://127.0.0.1:3002",
      CHECKOUT_DATABASE_URL:
        "postgresql://reader:fictional@127.0.0.1:5432/palcare_test",
      DEMO_DATA_SOURCE: "database",
      PAYPAL_CLIENT_ID: "fixture-id",
      PAYPAL_CLIENT_SECRET: "fixture-secret",
      PAYPAL_MERCHANT_ID: "TESTMERCHANT1",
      PAYPAL_SHOWCASE_ENABLED: "true",
      PAYPAL_SHOWCASE_REQUEST_ID: SHOWCASE_REQUEST_ID,
      PAYPAL_SHOWCASE_SESSION_HASH: scope.sessionHash,
      PAYPAL_SHOWCASE_BALANCE_CONFIRMED: "false",
      PAYPAL_SHOWCASE_STARTS_AT: scope.startsAt,
      PAYPAL_SHOWCASE_ENDS_AT: scope.endsAt,
    };
    const config = parseCheckoutConfig(env);
    expect(config.enabled && config.showcase?.balanceConfirmed).toBe(false);
    expect(
      parseCheckoutConfig({
        ...env,
        PAYPAL_IMMEDIATE_TEST_REQUEST_ID: SHOWCASE_REQUEST_ID,
        PAYPAL_IMMEDIATE_TEST_SESSION_HASH: scope.sessionHash,
        PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED: "true",
      }).enabled,
    ).toBe(false);
  });
});
