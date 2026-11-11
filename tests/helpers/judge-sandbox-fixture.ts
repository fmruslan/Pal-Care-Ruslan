// Synthetic TEST ONLY archive. Never used by the deployment seed/export command.
import { randomUUID } from "node:crypto";
import { unitOrder } from "./paypal-fixture";
import { CUSTOMER_ID, MERCHANT_ID } from "../../src/lib/demo/fixtures";
import type {
  CheckoutOrder,
  PurchaseTwin,
  CareDocument,
  CareEvent,
} from "../../src/db/schema";
export function syntheticJudgeSource() {
  const time = "2026-10-22T23:04:00.000Z";
  const checkout: CheckoutOrder = {
    ...unitOrder(),
    state: "completed",
    providerCaptureId: "TESTCAPTURE1234567",
    captureAttemptedAt: time,
    verifiedAt: time,
    capturedAt: time,
    createdAt: time,
    expiresAt: "2026-10-23T01:00:00.000Z",
    returnOrigin: "http://127.0.0.1:3002",
  };
  const twin: PurchaseTwin = {
    id: randomUUID(),
    customerId: CUSTOMER_ID,
    merchantId: MERCHANT_ID,
    productId: checkout.productId,
    purchasedOn: "2026-10-22",
    purchasePriceMinor: 12900,
    currency: "USD",
    origin: "sandbox",
    checkoutOrderId: checkout.id,
    paypalOrderId: checkout.providerOrderId,
    paypalCaptureId: checkout.providerCaptureId,
    verifiedAt: time,
    productSnapshot: checkout.product,
    createdAt: time,
  };
  const documents: CareDocument[] = [
    {
      id: randomUUID(),
      twinId: twin.id,
      title: "Synthetic test receipt",
      kind: "receipt",
      origin: "sandbox",
      content: `TEST ONLY ${checkout.providerOrderId} ${checkout.providerCaptureId}`,
    },
  ];
  const events: CareEvent[] = [
    {
      id: randomUUID(),
      twinId: twin.id,
      kind: "purchase",
      title: "Synthetic test purchase",
      description: "TEST ONLY — not genuine provider evidence",
      occurredOn: "2026-10-22",
      origin: "sandbox",
    },
  ];
  return { checkout, twin, documents, events };
}
