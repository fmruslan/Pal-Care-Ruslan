import { describe, expect, it } from "vitest";
import { customerDataset } from "../../src/lib/intelligence/customer-model";
import {
  purchaseHighlights,
  purchaseTotals,
} from "../../src/lib/intelligence/customer-presentation";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { emptyOverview } from "../../src/lib/price-guardian/projections";

function purchases() {
  return customerDataset(
    structuredClone(demoData),
    [referenceSource],
    emptyOverview(),
    { items: [], unavailable: [] },
  ).purchases;
}

describe("customer presentation keeps saved evidence authoritative", () => {
  it("uses actual loaded-window purchases and unique saved document links", () => {
    const rows = purchases();
    expect(purchaseTotals(rows)).toEqual({
      purchases: 4,
      documents: demoData.documents.length,
      verified: 0,
    });
    rows[0].documentLinks.push(...rows[0].documentLinks);
    rows[0].documentCount = 999;
    expect(purchaseTotals(rows).documents).toBe(demoData.documents.length);
  });

  it("never promotes samples or zero placeholder amounts", () => {
    const rows = purchases();
    expect(
      rows.find((p) => p.name === "Raspberry Pi 5")?.amountMinor,
    ).toBeNull();
    expect(purchaseTotals(rows).verified).toBe(0);
    expect(
      purchaseHighlights(rows).every((h) => h.purchase.origin === "sample"),
    ).toBe(true);
  });

  it("matches receipt and care suggestions to their exact saved purchase", () => {
    const rows = purchases();
    const highlights = purchaseHighlights(rows);
    expect(highlights).toHaveLength(2);
    for (const h of highlights) {
      const original = rows.find((p) => p.id === h.purchase.id)!;
      expect(h.href).toBe(
        h.kind === "receipt" ? original.receiptHref : original.careHref,
      );
    }
    expect(highlights.find((h) => h.kind === "care")?.purchase.name).toBe(
      "Raspberry Pi 5",
    );
  });

  it("requires an existing receipt link, not a purchase name or price", () => {
    const rows = purchases().map((p) => ({ ...p, receiptHref: null }));
    expect(purchaseHighlights(rows).map((h) => h.kind)).toEqual(["care"]);
  });

  it("does not suggest care when availability is missing or uncertain", () => {
    for (const careStatus of ["missing", "unavailable"] as const) {
      const rows = purchases().map((p) => ({ ...p, careStatus }));
      expect(purchaseHighlights(rows).some((h) => h.kind === "care")).toBe(
        false,
      );
    }
  });

  it("handles an empty loaded window without fabricated recommendations", () => {
    expect(purchaseTotals([])).toEqual({
      purchases: 0,
      documents: 0,
      verified: 0,
    });
    expect(purchaseHighlights([])).toEqual([]);
  });

  it("projects known original illustrations and drops arbitrary image locations", () => {
    const data = structuredClone(demoData);
    expect(
      purchases().find((p) => p.name === "Everyday headphones")?.illustration,
    ).toBe("headphones");
    data.products[0].illustration = "https://untrusted.example/image";
    const rows = customerDataset(data, [], emptyOverview(), {
      items: [],
      unavailable: [],
    }).purchases;
    expect(
      rows.find((p) => p.name === "Everyday headphones")?.illustration,
    ).toBeUndefined();
  });
});
