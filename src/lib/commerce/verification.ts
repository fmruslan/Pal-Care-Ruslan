import { z } from "zod";
import type { CheckoutOrder } from "../../db/schema";
import {
  CheckoutError,
  providerIdSchema,
  type CaptureStatus,
} from "./contracts";

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
  statusDetails: z.object({ reason: z.string().max(80).optional() }).optional(),
  invoiceId: z.string().optional(),
  customId: z.string().optional(),
  supplementaryData: z
    .object({
      relatedIds: z.object({ orderId: z.string().optional() }).optional(),
    })
    .optional(),
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

function validatedOrder(payload: unknown, expected: CheckoutOrder) {
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
  return order;
}

export type CaptureObservation = {
  id: string;
  status: CaptureStatus;
  capturedAt: string;
  pendingReason: "ECHECK" | null;
};

function captureObservation(
  payload: unknown,
  expected: CheckoutOrder,
): CaptureObservation {
  const parsed = captureSchema.safeParse(payload);
  if (!parsed.success) throw new CheckoutError("verification_failed");
  const capture = parsed.data;
  if (
    !["PENDING", "COMPLETED", "FAILED", "DECLINED"].includes(capture.status) ||
    ((expected.observedCaptureId ?? expected.providerCaptureId) &&
      capture.id !==
        (expected.observedCaptureId ?? expected.providerCaptureId)) ||
    decimalToMinor(capture.amount.value) !== expected.amountMinor ||
    capture.finalCapture !== true ||
    !capture.createTime ||
    Date.parse(capture.createTime) < Date.parse(expected.createdAt) - 300_000 ||
    Date.parse(capture.createTime) > Date.now() + 300_000 ||
    (capture.customId !== undefined && capture.customId !== expected.id) ||
    (capture.invoiceId !== undefined &&
      capture.invoiceId !== `PALCARE-${expected.id}`) ||
    (capture.supplementaryData?.relatedIds?.orderId !== undefined &&
      capture.supplementaryData.relatedIds.orderId !== expected.providerOrderId)
  )
    throw new CheckoutError("verification_failed");
  return {
    id: capture.id,
    status: capture.status as CaptureStatus,
    capturedAt: capture.createTime,
    pendingReason:
      capture.status === "PENDING" && capture.statusDetails?.reason === "ECHECK"
        ? "ECHECK"
        : null,
  };
}

// Relationship validation is separate from completion proof. Pending/failed
// captures can be identified safely without being labeled verified purchases.
export function inspectOrderCapture(payload: unknown, expected: CheckoutOrder) {
  const order = validatedOrder(payload, expected);
  const captures = order.purchaseUnits[0].payments?.captures ?? [];
  if (
    captures.length > 1 ||
    (order.status === "COMPLETED" && captures.length !== 1) ||
    ((expected.observedCaptureId ?? expected.providerCaptureId) &&
      captures.length !== 1)
  )
    throw new CheckoutError("verification_failed");
  const capture = captures[0]
    ? captureObservation(captures[0], expected)
    : null;
  if (capture?.status === "COMPLETED" && order.status !== "COMPLETED")
    throw new CheckoutError("verification_failed");
  return { status: order.status, capture };
}

export function inspectOrder(payload: unknown, expected: CheckoutOrder) {
  const result = inspectOrderCapture(payload, expected);
  if (!result.capture) return { status: result.status, capture: null };
  if (result.capture.status === "PENDING")
    return { status: "PENDING", capture: null };
  if (result.capture.status !== "COMPLETED")
    throw new CheckoutError("verification_failed");
  return {
    status: "COMPLETED",
    capture: { id: result.capture.id, capturedAt: result.capture.capturedAt },
  };
}

export function inspectCaptureStatus(
  payload: unknown,
  order: CheckoutOrder,
  expected: { id: string; capturedAt: string },
) {
  const capture = captureObservation(payload, order);
  if (
    capture.id !== expected.id ||
    Date.parse(capture.capturedAt) !== Date.parse(expected.capturedAt)
  )
    throw new CheckoutError("verification_failed");
  return capture;
}

export function inspectCapturedPayment(
  payload: unknown,
  order: CheckoutOrder,
  expected: { id: string; capturedAt: string },
) {
  const capture = inspectCaptureStatus(payload, order, expected);
  if (capture.status !== "COMPLETED")
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
