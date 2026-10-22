import { z } from "zod";
import type { CheckoutOrder } from "../../db/schema";
import { CheckoutError, providerIdSchema } from "./contracts";

const moneySchema = z.object({
  currencyCode: z.literal("USD"),
  value: z.string().regex(/^(0|[1-9]\d{0,6})\.\d{2}$/),
});
const captureSchema = z.object({
  id: providerIdSchema,
  status: z.string(),
  amount: moneySchema,
  finalCapture: z.boolean().optional(),
  createTime: z.iso.datetime().optional(),
  updateTime: z.iso.datetime().optional(),
});
const orderSchema = z.object({
  id: providerIdSchema,
  intent: z.literal("CAPTURE"),
  status: z.string(),
  purchaseUnits: z
    .array(
      z.object({
        referenceId: z.string(),
        customId: z.string(),
        invoiceId: z.string(),
        amount: moneySchema,
        items: z
          .array(
            z.object({
              sku: z.string(),
              quantity: z.literal("1"),
              unitAmount: moneySchema,
            }),
          )
          .length(1),
        payee: z.object({ merchantId: z.string() }),
        payments: z
          .object({ captures: z.array(captureSchema).optional() })
          .optional(),
      }),
    )
    .length(1),
});

export function decimalToMinor(value: string) {
  if (!/^(0|[1-9]\d{0,6})\.\d{2}$/.test(value))
    throw new CheckoutError("verification_failed");
  const [whole, fraction] = value.split(".");
  return Number(whole) * 100 + Number(fraction);
}
export function minorToDecimal(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 20000)
    throw new CheckoutError("invalid_product", 400);
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function inspectOrder(payload: unknown, expected: CheckoutOrder) {
  const result = orderSchema.safeParse(payload);
  if (!result.success) throw new CheckoutError("verification_failed");
  const order = result.data;
  const unit = order.purchaseUnits[0];
  if (
    order.id !== expected.providerOrderId ||
    unit.referenceId !== expected.id ||
    unit.customId !== expected.id ||
    unit.invoiceId !== `PALCARE-${expected.id}` ||
    unit.payee.merchantId !== expected.expectedPayeeId ||
    unit.items[0].sku !== expected.productId ||
    decimalToMinor(unit.items[0].unitAmount.value) !== expected.amountMinor ||
    decimalToMinor(unit.amount.value) !== expected.amountMinor
  ) {
    throw new CheckoutError("verification_failed");
  }
  const captures = unit.payments?.captures ?? [];
  if (order.status !== "COMPLETED") {
    if (
      captures.some((capture) =>
        ["COMPLETED", "REFUNDED", "PARTIALLY_REFUNDED"].includes(
          capture.status,
        ),
      )
    )
      throw new CheckoutError("verification_failed");
    return { status: order.status, capture: null };
  }
  // An order-level COMPLETED flag alone is not payment proof.
  if (captures.length !== 1) throw new CheckoutError("verification_failed");
  const capture = captures[0];
  if (decimalToMinor(capture.amount.value) !== expected.amountMinor)
    throw new CheckoutError("verification_failed");
  if (capture.status === "PENDING") return { status: "PENDING", capture: null };
  if (
    capture.status !== "COMPLETED" ||
    capture.finalCapture !== true ||
    !capture.createTime
  )
    throw new CheckoutError("verification_failed");
  if (
    new Date(capture.createTime).getTime() <
      new Date(expected.createdAt).getTime() - 300_000 ||
    new Date(capture.createTime).getTime() > Date.now() + 300_000
  )
    throw new CheckoutError("verification_failed");
  return {
    status: "COMPLETED",
    capture: { id: capture.id, capturedAt: capture.createTime },
  };
}

export function inspectCapturedPayment(
  payload: unknown,
  order: CheckoutOrder,
  expected: { id: string; capturedAt: string },
) {
  const parsed = captureSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.id !== expected.id ||
    parsed.data.status !== "COMPLETED" ||
    parsed.data.finalCapture !== true ||
    decimalToMinor(parsed.data.amount.value) !== order.amountMinor ||
    !parsed.data.createTime ||
    new Date(parsed.data.createTime).getTime() !==
      new Date(expected.capturedAt).getTime()
  )
    throw new CheckoutError("verification_failed");
  return expected;
}

export function approvalLink(payload: unknown) {
  const parsed = z
    .object({
      id: providerIdSchema,
      links: z.array(
        z.object({
          rel: z.string(),
          href: z.string(),
          method: z.string().optional(),
        }),
      ),
    })
    .safeParse(payload);
  if (!parsed.success) throw new CheckoutError("provider_unavailable", 502);
  const link = parsed.data.links.find((link) =>
    ["approve", "payer-action"].includes(link.rel),
  );
  if (!link || !URL.canParse(link.href))
    throw new CheckoutError("provider_unavailable", 502);
  const url = new URL(link.href);
  if (url.searchParams.get("token") !== parsed.data.id)
    throw new CheckoutError("verification_failed");
  if (
    url.protocol !== "https:" ||
    !["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new CheckoutError("verification_failed");
  return { id: parsed.data.id, url: url.href };
}
