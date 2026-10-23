import { z } from "zod";
import { providerIdSchema } from "./contracts";
import { decimalToMinor } from "./verification";
import { refundStatusSchema } from "./refund-contracts";
import { GuardianError } from "../price-guardian/contracts";

const refundSchema = z.object({
  id: providerIdSchema,
  status: refundStatusSchema,
  amount: z.object({ currencyCode: z.literal("USD"), value: z.string() }),
  customId: z.string().optional(),
  invoiceId: z.string().optional(),
  createTime: z.iso.datetime({ offset: true }),
  payer: z.object({ merchantId: z.string().optional() }).optional(),
  links: z
    .array(
      z.object({
        rel: z.string(),
        href: z.string(),
        method: z.string().optional(),
      }),
    )
    .max(20),
});
export function returnedRefundId(payload: unknown) {
  return z.object({ id: providerIdSchema }).parse(payload).id;
}
export function inspectRefund(
  payload: unknown,
  expected: {
    refundId: string;
    captureId: string;
    requestKey: string;
    amountMinor: number;
    attemptedAt: Date;
    merchantId: string;
  },
) {
  const result = refundSchema.safeParse(payload);
  if (!result.success)
    throw new GuardianError("guardian_refund_evidence_invalid");
  const refund = result.data;
  const up = refund.links.find((link) => link.rel === "up");
  if (!up || !URL.canParse(up.href))
    throw new GuardianError("guardian_refund_parent_missing");
  const url = new URL(up.href);
  if (
    url.protocol !== "https:" ||
    !["api-m.sandbox.paypal.com", "api.sandbox.paypal.com"].includes(
      url.hostname,
    ) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/v2/payments/captures/${expected.captureId}` ||
    (up.method && up.method !== "GET")
  )
    throw new GuardianError("guardian_refund_parent_invalid");
  if (
    refund.id !== expected.refundId ||
    decimalToMinor(refund.amount.value) !== expected.amountMinor ||
    (refund.customId !== undefined &&
      refund.customId !== expected.requestKey) ||
    (refund.invoiceId !== undefined &&
      refund.invoiceId !== `PG-${expected.requestKey}`) ||
    (refund.payer?.merchantId !== undefined &&
      refund.payer.merchantId !== expected.merchantId) ||
    Date.parse(refund.createTime) < expected.attemptedAt.getTime() - 300000 ||
    Date.parse(refund.createTime) > Date.now() + 300000
  )
    throw new GuardianError("guardian_refund_evidence_invalid");
  return { id: refund.id, status: refund.status };
}
export function discoverRefund(refunds: unknown[] | null, key: string) {
  // Optional Orders fields are never interpreted as proof of absence or success.
  if (!refunds) return { id: null, observation: "refund_collection_absent" };
  const candidates = refunds.flatMap((raw) => {
    const p = z
      .object({
        id: providerIdSchema,
        customId: z.literal(key),
        invoiceId: z.literal(`PG-${key}`),
      })
      .safeParse(raw);
    return p.success ? [p.data.id] : [];
  });
  if (candidates.length !== 1)
    return {
      id: null,
      observation: candidates.length
        ? "refund_collection_ambiguous"
        : "refund_correlation_absent",
    };
  return {
    id: candidates[0],
    observation: "candidate_requires_independent_verification",
  };
}
