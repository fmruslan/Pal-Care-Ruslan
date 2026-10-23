import { z } from "zod";
import { GuardianError } from "../price-guardian/contracts";
import { providerIdSchema } from "./contracts";

export const refundStatusSchema = z.enum([
  "PENDING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export interface RefundGateway {
  retrieve(orderId: string): Promise<unknown>;
  retrieveCapture(captureId: string): Promise<unknown>;
  refund(
    captureId: string,
    requestKey: string,
    amountMinor: number,
  ): Promise<unknown>;
  retrieveRefund(refundId: string): Promise<unknown>;
}
export const executionSchema = z.strictObject({
  enabled: z.literal(true),
  readsEnabled: z.literal(true),
  caseId: z.uuid(),
  captureId: providerIdSchema,
  experimentId: z.string().regex(/^[a-z0-9-]{1,60}$/),
  merchantId: z.string().regex(/^[A-Z0-9]{13}$/),
});
export type RefundScope = {
  restrictedWriter?: boolean;
  enabled: boolean;
  readsEnabled: boolean;
  caseId: string | null;
  captureId: string | null;
  experimentId: string | null;
  merchantId: string | null;
};
export function refundScope(
  env: Record<string, string | undefined>,
): RefundScope {
  const enabled = env.GUARDIAN_REFUNDS_ENABLED === "true",
    readsEnabled = env.GUARDIAN_PROVIDER_READS_ENABLED === "true";
  if (!enabled && !readsEnabled)
    return {
      enabled: false,
      readsEnabled: false,
      caseId: null,
      captureId: null,
      experimentId: null,
      merchantId: null,
    };
  const result = executionSchema.safeParse({
    enabled: true,
    readsEnabled,
    caseId: env.GUARDIAN_ALLOWED_CASE_ID,
    captureId: env.GUARDIAN_ALLOWED_CAPTURE_ID,
    experimentId: env.GUARDIAN_EXPERIMENT_ID,
    merchantId: env.PAYPAL_MERCHANT_ID,
  });
  if (
    !result.success ||
    env.PAYPAL_ENVIRONMENT !== "sandbox" ||
    !env.PAYPAL_CLIENT_ID ||
    !env.PAYPAL_CLIENT_SECRET ||
    !env.GUARDIAN_DATABASE_URL ||
    !URL.canParse(env.GUARDIAN_DATABASE_URL) ||
    !["postgres:", "postgresql:"].includes(
      new URL(env.GUARDIAN_DATABASE_URL).protocol,
    ) ||
    env.DEMO_DATA_SOURCE !== "database"
  )
    throw new GuardianError("guardian_financial_configuration_invalid", 503);
  return { ...result.data, enabled, restrictedWriter: true };
}
export function refundBody(requestKey: string, amountMinor: number) {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    amountMinor > 2000
  )
    throw new GuardianError("guardian_amount_invalid");
  return {
    amount: {
      currencyCode: "USD",
      value: `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, "0")}`,
    },
    customId: requestKey,
    invoiceId: `PG-${requestKey}`,
    noteToPayer:
      "Pal Care demo merchant price adjustment. PayPal Sandbox funds only.",
  };
}
