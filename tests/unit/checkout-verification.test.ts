import { describe, expect, it } from "vitest";
import {
  approvalLink,
  decimalToMinor,
  inspectOrder,
  inspectCapturedPayment,
  inspectOrderCapture,
  inspectCaptureStatus,
  minorToDecimal,
} from "../../src/lib/commerce/verification";
import { createOrderBody } from "../../src/lib/commerce/paypal";
import { providerFixture, unitOrder } from "../helpers/paypal-fixture";

describe("PayPal verification with explicit test fixtures (not live proof)", () => {
  it.each(["PENDING", "COMPLETED", "FAILED", "DECLINED"])(
    "validates %s capture identity without treating it as completed proof",
    (status) => {
      const order = unitOrder();
      const payload = providerFixture(order, "COMPLETED", status);
      const observed = inspectOrderCapture(payload, order).capture!;
      expect(observed.status).toBe(status);
      expect(
        inspectCaptureStatus(
          payload.purchaseUnits[0].payments.captures[0],
          order,
          observed,
        ).status,
      ).toBe(status);
      if (status !== "COMPLETED")
        expect(() =>
          inspectCapturedPayment(
            payload.purchaseUnits[0].payments.captures[0],
            order,
            observed,
          ),
        ).toThrow("verification_failed");
    },
  );
  it.each([
    "id",
    "amount",
    "currency",
    "timestamp",
    "final",
    "related-order",
    "invoice",
    "custom",
  ])("rejects mismatched Payments v2 %s on a pending capture", (field) => {
    const order = unitOrder();
    const payload = providerFixture(order, "COMPLETED", "PENDING");
    const expected = inspectOrderCapture(payload, order).capture!;
    const capture: Record<string, unknown> = structuredClone(
      payload.purchaseUnits[0].payments.captures[0],
    );
    if (field === "id") capture.id = "OTHERTESTCAPTURE1";
    if (field === "amount")
      capture.amount = { value: "0.01", currencyCode: "USD" };
    if (field === "currency")
      capture.amount = { value: "129.00", currencyCode: "EUR" };
    if (field === "timestamp")
      capture.createTime = new Date(Date.now() + 60000).toISOString();
    if (field === "final") capture.finalCapture = false;
    if (field === "related-order")
      capture.supplementaryData = {
        relatedIds: { orderId: "OTHERTESTORDER1" },
      };
    if (field === "invoice") capture.invoiceId = "OTHER-INVOICE";
    if (field === "custom") capture.customId = "OTHER-CHECKOUT";
    expect(() => inspectCaptureStatus(capture, order, expected)).toThrow(
      "verification_failed",
    );
  });
  it.each(["observedCaptureId", "providerCaptureId"] as const)(
    "cannot replace a pinned %s with another Orders v2 capture",
    (field) => {
      const order = unitOrder();
      order[field] = "PINNEDTESTCAPTURE1";
      expect(() =>
        inspectOrderCapture(
          providerFixture(order, "COMPLETED", "PENDING"),
          order,
        ),
      ).toThrow("verification_failed");
    },
  );
  it("returns only the allowlisted pending reason rather than arbitrary provider text", () => {
    const order = unitOrder();
    const payload = providerFixture(order, "COMPLETED", "PENDING");
    expect(inspectOrderCapture(payload, order).capture?.pendingReason).toBe(
      "ECHECK",
    );
    payload.purchaseUnits[0].payments.captures[0].statusDetails.reason =
      "untrusted explanatory text";
    expect(
      inspectOrderCapture(payload, order).capture?.pendingReason,
    ).toBeNull();
  });
  it("independently validates the Payments v2 capture against the Orders v2 evidence", () => {
    const order = unitOrder();
    const payload = providerFixture(order, "COMPLETED");
    const evidence = inspectOrder(payload, order).capture!;
    const capture = payload.purchaseUnits[0].payments.captures[0];
    expect(inspectCapturedPayment(capture, order, evidence)).toEqual(evidence);
    expect(() =>
      inspectCapturedPayment(
        { ...capture, id: "WRONGCAPTURE12345" },
        order,
        evidence,
      ),
    ).toThrow("verification_failed");
    expect(() =>
      inspectCapturedPayment(
        { ...capture, status: "PENDING" },
        order,
        evidence,
      ),
    ).toThrow("verification_failed");
  });
  it("requires a completed final capture and matching merchant/order/amount", () => {
    const order = unitOrder();
    expect(
      inspectOrder(providerFixture(order, "COMPLETED"), order).capture?.id,
    ).toBeTruthy();
    expect(
      inspectOrder(providerFixture(order, "APPROVED"), order).capture,
    ).toBeNull();
    expect(
      inspectOrder(providerFixture(order, "COMPLETED", "PENDING"), order)
        .capture,
    ).toBeNull();
  });
  it.each([
    "wrong-order",
    "wrong-merchant",
    "wrong-amount",
    "wrong-currency",
    "wrong-reference",
    "wrong-invoice",
    "missing-capture",
    "partial-capture",
    "failed-capture",
    "invalid-date",
  ])("rejects %s", (scenario) => {
    const order = unitOrder();
    const payload = providerFixture(order, "COMPLETED");
    const unit = payload.purchaseUnits[0];
    if (scenario === "wrong-order") payload.id = "WRONGORDER12345678";
    if (scenario === "wrong-merchant") unit.payee.merchantId = "OTHER";
    if (scenario === "wrong-amount") unit.amount.value = "0.01";
    if (scenario === "wrong-currency") unit.amount.currencyCode = "EUR";
    if (scenario === "wrong-reference") unit.customId = "untrusted";
    if (scenario === "wrong-invoice") unit.invoiceId = "untrusted";
    if (scenario === "missing-capture") unit.payments.captures = [];
    if (scenario === "partial-capture")
      unit.payments.captures[0].finalCapture = false;
    if (scenario === "failed-capture")
      unit.payments.captures[0].status = "DENIED";
    if (scenario === "invalid-date")
      unit.payments.captures[0].createTime = "2020-01-01T00:00:00Z";
    expect(() => inspectOrder(payload, order)).toThrow("verification_failed");
  });
  it("does not accept multiple purchase units or captures", () => {
    const order = unitOrder();
    const payload = providerFixture(order, "COMPLETED");
    payload.purchaseUnits[0].payments.captures.push(
      payload.purchaseUnits[0].payments.captures[0],
    );
    expect(() => inspectOrder(payload, order)).toThrow();
    payload.purchaseUnits.push(payload.purchaseUnits[0]);
    expect(() => inspectOrder(payload, order)).toThrow();
  });
  it("uses only the fixed sandbox approval hosts", () => {
    for (const href of [
      "https://www.paypal.com/checkoutnow",
      "https://sandbox.paypal.com.evil.example/",
      "javascript:alert(1)",
      "https://evil@sandbox.paypal.com/",
      "http://sandbox.paypal.com/",
    ]) {
      expect(() =>
        approvalLink({
          id: "TESTORDER123456789",
          links: [{ rel: "approve", href }],
        }),
      ).toThrow();
    }
  });
  it("builds the official SDK payload from the saved snapshot", () => {
    const order = unitOrder();
    const body = createOrderBody(order);
    expect(body.intent).toBe("CAPTURE");
    expect(body.purchaseUnits[0].amount.value).toBe("129.00");
    expect(body.purchaseUnits[0].payee.merchantId).toBe(order.expectedPayeeId);
    expect(body.purchaseUnits[0].customId).toBe(order.id);
    expect(body.paymentSource.paypal.experienceContext.shippingPreference).toBe(
      "NO_SHIPPING",
    );
    expect(body.paymentSource.paypal.experienceContext.cancelUrl).toContain(
      "?cancel=1",
    );
    expect(JSON.stringify(body)).not.toContain("payer");
  });
  it("converts USD decimal strings without floating-point multiplication", () => {
    expect(decimalToMinor("129.01")).toBe(12901);
    expect(minorToDecimal(12901)).toBe("129.01");
    for (const value of ["1", "1.999", "1e2", "-1.00", "NaN", "01.00"])
      expect(() => decimalToMinor(value)).toThrow();
  });
});
