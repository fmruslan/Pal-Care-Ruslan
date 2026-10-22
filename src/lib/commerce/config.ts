import { z } from "zod";
import { databaseUrlSchema } from "../config";

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
  const parsed = z
    .object({
      origin: originSchema,
      databaseUrl: databaseUrlSchema,
      environment: z.literal("sandbox"),
      clientId: z.string().trim().min(1),
      clientSecret: z.string().trim().min(1),
      merchantId: z.string().regex(/^[A-Z0-9]{13}$/),
      source: z.literal("database"),
    })
    .safeParse({
      origin: env.APP_ORIGIN,
      databaseUrl: env.CHECKOUT_DATABASE_URL || env.DATABASE_URL,
      environment: env.PAYPAL_ENVIRONMENT,
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      merchantId: env.PAYPAL_MERCHANT_ID,
      source: env.DEMO_DATA_SOURCE,
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

export function checkoutAvailability() {
  const config = parseCheckoutConfig(process.env);
  return config.enabled
    ? { enabled: true, reason: "PayPal Sandbox only · no real money" }
    : { enabled: false, reason: config.reason };
}
