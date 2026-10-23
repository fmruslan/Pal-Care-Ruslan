// Offline configuration/payload tests only; no PayPal request is made.
import { describe, expect, it } from "vitest";
import {
  checkoutAvailability,
  parseCheckoutConfig,
} from "../../src/lib/commerce/config";
import {
  startCheckoutSchema,
  IMMEDIATE_TEST_PRODUCT_ID,
} from "../../src/lib/commerce/contracts";
import { createOrderBody } from "../../src/lib/commerce/paypal";
import { unitOrder } from "../helpers/paypal-fixture";

const requestId = "00000000-0000-4000-8000-000000000999";
const owner = "a".repeat(64);
const env = {
  PAYPAL_CHECKOUT_ENABLED: "true",
  PAYPAL_ENVIRONMENT: "sandbox",
  DEMO_DATA_SOURCE: "database",
  CHECKOUT_DATABASE_URL: "postgresql://localhost/unit_test",
  APP_ORIGIN: "https://palcare.example",
  PAYPAL_CLIENT_ID: "unit-client",
  PAYPAL_CLIENT_SECRET: "unit-secret",
  PAYPAL_MERCHANT_ID: "TESTMERCHANT1",
  PAYPAL_IMMEDIATE_TEST_REQUEST_ID: requestId,
  PAYPAL_IMMEDIATE_TEST_SESSION_HASH: owner,
  PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED: "false",
};

describe("one conditional immediate-payment Sandbox test", () => {
  it("keeps status services enabled but creates no eligible UI request before balance confirmation", () => {
    expect(parseCheckoutConfig(env).enabled).toBe(true);
    const view = checkoutAvailability(owner, env);
    expect(view.enabled).toBe(false);
    expect(view.approvedRequestId).toBeNull();
    expect(view.reason).toContain("paused");
  });
  it("only exposes the reserved request to its owning browser after confirmation", () => {
    const armed = { ...env, PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED: "true" };
    expect(checkoutAvailability(owner, armed)).toMatchObject({
      enabled: true,
      approvedRequestId: requestId,
      allowedProductId: IMMEDIATE_TEST_PRODUCT_ID,
    });
    for (const hash of [undefined, "b".repeat(64)])
      expect(checkoutAvailability(hash, armed)).toMatchObject({
        enabled: false,
        approvedRequestId: null,
      });
    const json = JSON.stringify(checkoutAvailability(owner, armed));
    expect(json).not.toContain(owner);
    expect(json).not.toContain("unit-secret");
    expect(json).not.toContain("unit-client");
  });
  it.each([
    "PAYPAL_IMMEDIATE_TEST_REQUEST_ID",
    "PAYPAL_IMMEDIATE_TEST_SESSION_HASH",
    "PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED",
  ])("fails closed for missing %s", (key) => {
    const changed: Record<string, string | undefined> = { ...env };
    delete changed[key];
    expect(parseCheckoutConfig(changed).enabled).toBe(false);
  });
  it.each([
    { PAYPAL_IMMEDIATE_TEST_REQUEST_ID: "not-a-uuid" },
    { PAYPAL_IMMEDIATE_TEST_SESSION_HASH: "not-a-cookie-digest" },
    { PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED: "yes" },
    { PAYPAL_ENVIRONMENT: "production" },
  ])("rejects invalid operator scope %j", (overrides) =>
    expect(parseCheckoutConfig({ ...env, ...overrides }).enabled).toBe(false),
  );
  it("does not let visitors select the payment preference or confirmation", () => {
    for (const extra of [
      { paymentMethodPreference: "IMMEDIATE_PAYMENT_REQUIRED" },
      { balanceConfirmed: true },
    ])
      expect(
        startCheckoutSchema.safeParse({
          productId: IMMEDIATE_TEST_PRODUCT_ID,
          requestId,
          ...extra,
        }).success,
      ).toBe(false);
  });
  it("preserves the entire legacy create payload when preference is null", () => {
    const order = unitOrder();
    expect(createOrderBody(order)).toEqual({
      intent: "CAPTURE",
      purchaseUnits: [
        {
          referenceId: order.id,
          customId: order.id,
          invoiceId: `PALCARE-${order.id}`,
          description:
            "Pal Care fictional product — sandbox only; nothing ships",
          payee: { merchantId: order.expectedPayeeId },
          amount: {
            currencyCode: "USD",
            value: "129.00",
            breakdown: { itemTotal: { currencyCode: "USD", value: "129.00" } },
          },
          items: [
            {
              name: order.product.name,
              sku: order.product.id,
              quantity: "1",
              category: "PHYSICAL_GOODS",
              unitAmount: { currencyCode: "USD", value: "129.00" },
            },
          ],
        },
      ],
      paymentSource: {
        paypal: {
          experienceContext: {
            brandName: "Pal Care Sandbox Demo",
            shippingPreference: "NO_SHIPPING",
            userAction: "PAY_NOW",
            returnUrl: `${order.returnOrigin}/checkout/${order.id}`,
            cancelUrl: `${order.returnOrigin}/checkout/${order.id}?cancel=1`,
          },
        },
      },
    });
    expect(
      createOrderBody(order).paymentSource.paypal.experienceContext,
    ).not.toHaveProperty("paymentMethodPreference");
  });
  it("adds only the supported immediate preference to the snapshotted new test", () => {
    const order = unitOrder();
    const legacy = createOrderBody(order);
    order.paymentMethodPreference = "IMMEDIATE_PAYMENT_REQUIRED";
    const immediate = createOrderBody(order);
    expect(
      immediate.paymentSource.paypal.experienceContext.paymentMethodPreference,
    ).toBe("IMMEDIATE_PAYMENT_REQUIRED");
    delete immediate.paymentSource.paypal.experienceContext
      .paymentMethodPreference;
    expect(immediate).toEqual(legacy);
  });
});
