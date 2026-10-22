import { z } from "zod";
import { databaseUrlSchema } from "../config";
import { IMMEDIATE_TEST_PRODUCT_ID } from "./contracts";

const immediateTestSchema = z.object({
  requestId: z.uuid(),
  sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
  balanceConfirmed: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
});

const originSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const u = new URL(value);
  return (
    !u.username &&
    !u.password &&
    u.pathname === "/" &&
    !u.search &&
    !u.hash &&
    (u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)))
  );
});
export function parseCheckoutConfig(env: Record<string, string | undefined>) {
  if (env.PAYPAL_CHECKOUT_ENABLED !== "true")
    return {
      enabled: false as const,
      reason: "Sandbox checkout is disabled. Configure PayPal to enable it.",
    };
  const testConfigured = [
    env.PAYPAL_IMMEDIATE_TEST_REQUEST_ID,
    env.PAYPAL_IMMEDIATE_TEST_SESSION_HASH,
    env.PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED,
  ].some(Boolean);
  const parsed = z
    .object({
      origin: originSchema,
      databaseUrl: databaseUrlSchema,
      environment: z.literal("sandbox"),
      clientId: z.string().trim().min(1),
      clientSecret: z.string().trim().min(1),
      merchantId: z.string().regex(/^[A-Z0-9]{13}$/),
      source: z.literal("database"),
      immediateTest: immediateTestSchema.optional(),
    })
    .safeParse({
      origin: env.APP_ORIGIN,
      databaseUrl: env.CHECKOUT_DATABASE_URL || env.DATABASE_URL,
      environment: env.PAYPAL_ENVIRONMENT,
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      merchantId: env.PAYPAL_MERCHANT_ID,
      source: env.DEMO_DATA_SOURCE,
      immediateTest: testConfigured
        ? {
            requestId: env.PAYPAL_IMMEDIATE_TEST_REQUEST_ID,
            sessionHash: env.PAYPAL_IMMEDIATE_TEST_SESSION_HASH,
            balanceConfirmed: env.PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED,
          }
        : undefined,
    });
  if (!parsed.success)
    return {
      enabled: false as const,
      reason:
        "Sandbox checkout configuration is incomplete. See docs/PAYPAL.md.",
    };
  return { enabled: true as const, ...parsed.data };
}
export type CheckoutConfig = Extract<
  ReturnType<typeof parseCheckoutConfig>,
  { enabled: true }
>;

export function checkoutAvailability(
  ownerSessionHash?: string,
  env: Record<string, string | undefined> = process.env,
) {
  const config = parseCheckoutConfig(env);
  const availability = {
    enabled: false,
    reason: "",
    allowedProductId: null as string | null,
    approvedRequestId: null as string | null,
  };
  if (!config.enabled) return { ...availability, reason: config.reason };
  if (!config.immediateTest)
    return {
      ...availability,
      enabled: true,
      reason: "PayPal Sandbox only · no real money",
    };
  if (!config.immediateTest.balanceConfirmed)
    return {
      ...availability,
      reason:
        "Immediate-payment test is paused until the buyer confirms sufficient available Sandbox USD balance. Do not create an order yet.",
    };
  if (config.immediateTest.sessionHash !== ownerSessionHash)
    return {
      ...availability,
      reason:
        "This single Sandbox test is reserved for its originating browser. No new order is authorized here.",
    };
  return {
    ...availability,
    enabled: true,
    reason:
      "One approved USD 129.00 Sandbox balance test. Select PayPal balance only; stop if unavailable or insufficient.",
    allowedProductId: IMMEDIATE_TEST_PRODUCT_ID,
    approvedRequestId: config.immediateTest.requestId,
  };
}
