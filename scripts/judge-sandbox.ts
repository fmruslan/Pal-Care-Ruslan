// Operator-only historical export/import shape. Never imported by web code.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { productSnapshotSchema } from "../src/lib/commerce/contracts";
import type {
  CheckoutOrder,
  PurchaseTwin,
  CareDocument,
  CareEvent,
} from "../src/db/schema";
import { CUSTOMER_ID, MERCHANT_ID } from "../src/lib/demo/fixtures";

const timestamp = z.string().refine((s) => Number.isFinite(Date.parse(s)));
const policy = z.strictObject({
  version: z.string().max(80),
  title: z.string().max(120),
  content: z.string().max(20000),
});
export const judgeSandboxSchema = z
  .strictObject({
    format: z.literal("palcare-sanitized-historical-sandbox-v1"),
    note: z.literal(
      "Copied historical Sandbox evidence; provider references pseudonymized. No new payment or provider verification.",
    ),
    checkout: z.strictObject({
      id: z.uuid(),
      sessionHash: z.string().regex(/^[a-f0-9]{64}$/),
      requestId: z.uuid(),
      productId: z.uuid(),
      product: productSnapshotSchema,
      policy,
      returnOrigin: z.literal("https://historical-sandbox.invalid"),
      expectedPayeeId: z.literal("REDACTED00000"),
      amountMinor: z.literal(12900),
      currency: z.literal("USD"),
      state: z.literal("completed"),
      createKey: z.uuid(),
      captureKey: z.uuid(),
      providerOrderId: z.string().regex(/^ARCHIVE[A-F0-9]{24}$/),
      providerCaptureId: z.string().regex(/^ARCHIVE[A-F0-9]{24}$/),
      captureAttemptedAt: timestamp,
      verifiedAt: timestamp,
      capturedAt: timestamp,
      createdAt: timestamp,
      expiresAt: timestamp,
    }),
    twin: z.strictObject({
      id: z.uuid(),
      customerId: z.literal(CUSTOMER_ID),
      merchantId: z.literal(MERCHANT_ID),
      productId: z.uuid(),
      purchasedOn: z.literal("2026-10-22"),
      purchasePriceMinor: z.literal(12900),
      currency: z.literal("USD"),
      origin: z.literal("sandbox"),
      checkoutOrderId: z.uuid(),
      paypalOrderId: z.string(),
      paypalCaptureId: z.string(),
      verifiedAt: timestamp,
      productSnapshot: productSnapshotSchema,
      createdAt: timestamp,
    }),
    documents: z
      .array(
        z.strictObject({
          id: z.uuid(),
          twinId: z.uuid(),
          title: z.string().max(120),
          kind: z.enum(["receipt", "policy"]),
          content: z.string().min(1).max(20000),
          origin: z.enum(["sample", "sandbox"]),
        }),
      )
      .min(1)
      .max(4),
    events: z
      .array(
        z.strictObject({
          id: z.uuid(),
          twinId: z.uuid(),
          title: z.string().max(120),
          kind: z.literal("purchase"),
          description: z.string().max(20000),
          occurredOn: z.iso.date(),
          origin: z.literal("sandbox"),
        }),
      )
      .length(1),
  })
  .superRefine((v, ctx) => {
    const c = v.checkout,
      t = v.twin;
    if (
      c.id !== t.checkoutOrderId ||
      c.providerOrderId !== t.paypalOrderId ||
      c.providerCaptureId !== t.paypalCaptureId ||
      c.productId !== t.productId ||
      c.product.id !== t.productId ||
      c.product.merchantId !== MERCHANT_ID ||
      JSON.stringify(c.product) !== JSON.stringify(t.productSnapshot) ||
      !v.documents.some(
        (d) => d.kind === "receipt" && d.origin === "sandbox",
      ) ||
      [...v.documents, ...v.events].some((r) => r.twinId !== t.id)
    )
      ctx.addIssue({
        code: "custom",
        message: "historical_archive_binding_invalid",
      });
    // No network/session/private-identity material is carried in the archive.
    if (
      /tailscale|tail[0-9a-z]+\.ts\.net|127\.0\.0\.1|localhost|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(
        JSON.stringify(v),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "historical_archive_private_data",
      });
  });

export function sanitizedSandbox(
  checkout: CheckoutOrder,
  twin: PurchaseTwin,
  documents: CareDocument[],
  events: CareEvent[],
) {
  if (
    checkout.state !== "completed" ||
    twin.origin !== "sandbox" ||
    checkout.id !== twin.checkoutOrderId ||
    checkout.providerOrderId !== twin.paypalOrderId ||
    checkout.providerCaptureId !== twin.paypalCaptureId ||
    !checkout.captureAttemptedAt ||
    checkout.amountMinor !== 12900 ||
    twin.purchasePriceMinor !== 12900 ||
    twin.purchasedOn !== "2026-10-22"
  )
    throw Error("genuine_historical_sandbox_required");
  const alias = (id: string) =>
    "ARCHIVE" +
    createHash("sha256").update(id).digest("hex").slice(0, 24).toUpperCase();
  const order = alias(twin.paypalOrderId!),
    capture = alias(twin.paypalCaptureId!);
  const redact = (s: string) =>
    s
      .replaceAll(twin.paypalOrderId!, order)
      .replaceAll(twin.paypalCaptureId!, capture);
  return judgeSandboxSchema.parse({
    format: "palcare-sanitized-historical-sandbox-v1",
    note: "Copied historical Sandbox evidence; provider references pseudonymized. No new payment or provider verification.",
    checkout: {
      id: checkout.id,
      sessionHash: randomBytes(32).toString("hex"),
      requestId: randomUUID(),
      productId: checkout.productId,
      product: productSnapshotSchema.parse(checkout.product),
      policy: policy.parse(checkout.policy),
      returnOrigin: "https://historical-sandbox.invalid",
      expectedPayeeId: "REDACTED00000",
      amountMinor: checkout.amountMinor,
      currency: checkout.currency,
      state: checkout.state,
      createKey: randomUUID(),
      captureKey: randomUUID(),
      providerOrderId: order,
      providerCaptureId: capture,
      captureAttemptedAt: checkout.captureAttemptedAt,
      verifiedAt: checkout.verifiedAt,
      capturedAt: checkout.capturedAt,
      createdAt: checkout.createdAt,
      expiresAt: checkout.expiresAt,
    },
    twin: { ...twin, paypalOrderId: order, paypalCaptureId: capture },
    documents: documents.map((d) => ({
      ...d,
      content:
        redact(d.content) +
        "\n\nHistorical judge copy: provider references pseudonymized; no new provider verification.",
    })),
    events: events.map((e) => ({
      ...e,
      description:
        redact(e.description) +
        " Historical judge copy; provider references pseudonymized.",
    })),
  });
}
