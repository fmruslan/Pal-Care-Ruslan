import { describe, expect, it } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { findTwin, money, displayDate } from "../../src/lib/demo/presentation";

describe("fictional demo integrity", () => {
  it("has no fabricated provider references or real customer contact information", () => {
    expect(demoData.customer.kind).toBe("fictional");
    expect(demoData.merchant.kind).toBe("fictional");
    expect(JSON.stringify(demoData)).not.toMatch(
      /@(gmail|outlook)|capture_id|refund_id|paypalOrderId/,
    );
    for (const record of [
      ...demoData.twins,
      ...demoData.documents,
      ...demoData.events,
    ])
      expect(record.origin).toBe("sample");
  });
  it("resolves every Purchase Twin to the right merchant, product, documents and events", () => {
    for (const twin of demoData.twins) {
      const record = findTwin(demoData, twin.id)!;
      expect(record.product.id).toBe(twin.productId);
      expect(record.product.merchantId).toBe(twin.merchantId);
      expect(record.documents.length).toBeGreaterThan(0);
      expect(record.events.length).toBeGreaterThan(0);
    }
  });
  it("does not return arbitrary or malformed record IDs", () => {
    expect(findTwin(demoData, "../../etc/passwd")).toBeUndefined();
    expect(
      findTwin(demoData, "00000000-0000-4000-8000-999999999999"),
    ).toBeUndefined();
  });
  it("does not return a twin belonging to another customer or merchant", () => {
    const data = structuredClone(demoData);
    data.twins[0].customerId = "00000000-0000-4000-8000-000000000999";
    expect(findTwin(data, data.twins[0].id)).toBeUndefined();
    data.twins[1].merchantId = "00000000-0000-4000-8000-000000000999";
    expect(findTwin(data, data.twins[1].id)).toBeUndefined();
  });
  it("does not attach a product from another merchant", () => {
    const data = structuredClone(demoData);
    data.products[0].merchantId = "00000000-0000-4000-8000-000000000999";
    expect(findTwin(data, data.twins[0].id)).toBeUndefined();
  });
  it("all downloadable content declares itself sample data", () => {
    for (const document of demoData.documents)
      expect(document.content).toContain("SAMPLE");
  });
});

describe("presentation does not calculate financial eligibility", () => {
  it("formats integer USD minor units", () => {
    expect(money(14900)).toBe("$149.00");
    expect(money(1)).toBe("$0.01");
    expect(money(0)).toBe("$0.00");
  });
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid money %s",
    (amount) => {
      expect(() => money(amount)).toThrow();
    },
  );
  it("rejects unsupported currencies", () =>
    expect(() => money(100, "JPY")).toThrow());
  it("formats dates consistently in UTC", () =>
    expect(displayDate("2026-10-18")).toBe("Oct 18, 2026"));
});
