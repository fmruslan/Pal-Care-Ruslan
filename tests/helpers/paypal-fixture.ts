// TEST DOUBLE ONLY. Not PayPal evidence; never reachable from application routes.
import { randomUUID } from "node:crypto";
import type { CheckoutOrder } from "../../src/db/schema";
import type { PayPalGateway } from "../../src/lib/commerce/paypal";
import { CheckoutError } from "../../src/lib/commerce/contracts";
import { minorToDecimal } from "../../src/lib/commerce/verification";

export const testConfig = {
  origin: "https://palcare.example",
  merchantId: "TESTMERCHANT1",
};
export function providerFixture(
  order: CheckoutOrder,
  status = "APPROVED",
  captureStatus = "COMPLETED",
) {
  return {
    id: order.providerOrderId,
    intent: "CAPTURE",
    status,
    purchaseUnits: [
      {
        referenceId: order.id,
        customId: order.id,
        invoiceId: `PALCARE-${order.id}`,
        amount: {
          currencyCode: "USD",
          value: minorToDecimal(order.amountMinor),
        },
        payee: { merchantId: order.expectedPayeeId },
        items: [
          {
            sku: order.productId,
            quantity: "1",
            unitAmount: {
              currencyCode: "USD",
              value: minorToDecimal(order.amountMinor),
            },
          },
        ],
        payments: {
          captures:
            status === "COMPLETED"
              ? [
                  {
                    id: `C${order.id.replaceAll("-", "").toUpperCase()}`,
                    status: captureStatus,
                    amount: {
                      currencyCode: "USD",
                      value: minorToDecimal(order.amountMinor),
                    },
                    finalCapture: true,
                    createTime: new Date(order.createdAt).toISOString(),
                  },
                ]
              : [],
        },
      },
    ],
  };
}
export function unitOrder(): CheckoutOrder {
  return {
    id: randomUUID(),
    sessionHash: "a".repeat(64),
    requestId: randomUUID(),
    productId: "00000000-0000-4000-8000-000000000101",
    product: {
      id: "00000000-0000-4000-8000-000000000101",
      merchantId: "00000000-0000-4000-8000-000000000002",
      name: "Test fixture",
      brand: "Test",
      model: "T-1",
      category: "Audio",
      illustration: "headphones",
      priceMinor: 12900,
      currency: "USD",
      merchantName: "Fictional fixture",
    },
    policy: { version: "unit", title: "Unit policy", content: "Test only" },
    returnOrigin: testConfig.origin,
    expectedPayeeId: testConfig.merchantId,
    amountMinor: 12900,
    currency: "USD",
    state: "created",
    createKey: randomUUID(),
    captureKey: randomUUID(),
    providerOrderId: "TESTORDER123456789",
    providerCaptureId: null,
    approvalUrl: null,
    captureAttemptedAt: null,
    verifiedAt: null,
    capturedAt: null,
    lastError: null,
    leaseToken: null,
    leaseUntil: null,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}
export class FakePayPal implements PayPalGateway {
  orders = new Map<string, CheckoutOrder>();
  createCalls: CheckoutOrder[] = [];
  captureCalls: { id: string; key: string }[] = [];
  status = "APPROVED";
  captureStatus = "COMPLETED";
  failCreate = false;
  captureError: string | null = null;
  completeBeforeError = false;
  tamperAmount = false;
  retrieveGate: Promise<void> | null = null;
  async create(order: CheckoutOrder) {
    this.createCalls.push(structuredClone(order));
    if (this.failCreate) throw new CheckoutError("provider_unavailable", 502);
    const id = `T${order.id.replaceAll("-", "").toUpperCase()}`;
    this.orders.set(id, { ...order, providerOrderId: id });
    return {
      id,
      links: [
        {
          rel: "payer-action",
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
        },
      ],
    };
  }
  async retrieve(id: string) {
    if (this.retrieveGate) await this.retrieveGate;
    const fixture = providerFixture(
      this.orders.get(id)!,
      this.status,
      this.captureStatus,
    );
    if (this.tamperAmount) fixture.purchaseUnits[0].amount.value = "0.01";
    return fixture;
  }
  async retrieveCapture(id: string) {
    const order = [...this.orders.values()].find(
      (order) => `C${order.id.replaceAll("-", "").toUpperCase()}` === id,
    )!;
    return providerFixture(order, "COMPLETED", this.captureStatus)
      .purchaseUnits[0].payments.captures[0];
  }
  async capture(id: string, key: string) {
    this.captureCalls.push({ id, key });
    if (!this.captureError || this.completeBeforeError)
      this.status = "COMPLETED";
    if (this.captureError) throw new CheckoutError(this.captureError, 502);
  }
}
