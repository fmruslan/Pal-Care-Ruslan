import { describe, expect, it } from "vitest";
import { documentPresentation } from "../../src/lib/document-presentation";
import { documentViewSchema } from "../../src/lib/document-view";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  withTenProductFixtures,
  demoId,
} from "../../src/lib/care/demo/catalog";
import { withConsumerDemoFixtures } from "../../src/lib/care/demo/consumer-evidence";
import { findTwin } from "../../src/lib/demo/presentation";
import { demoMerchantPolicy } from "../../src/lib/commerce/contracts";

const data = withConsumerDemoFixtures(withTenProductFixtures(demoData));
const view = (n: number, at = "2026-11-10T12:00:00Z") => {
  const doc = data.documents.find((d) => d.id === demoId(n))!;
  return documentPresentation(doc, findTwin(data, doc.twinId)!, at);
};
describe("validated customer documents", () => {
  it("renders every one of the 23 original illustrative documents without changing any evidence", () => {
    const before = JSON.stringify(data);
    expect(data.documents).toHaveLength(23);
    for (const doc of data.documents) {
      const presentation = documentViewSchema.parse(
        documentPresentation(doc, findTwin(data, doc.twinId)!),
      );
      expect(presentation.recognized, doc.id).toBe(true);
      expect(presentation.title).not.toMatch(
        /simulated Care|Demo source|schema|version/,
      );
      expect(
        JSON.stringify({
          ...presentation,
          actions: presentation.actions.map((a) => a.label),
        }),
      ).not.toMatch(/00000000-0000|twinId|refundConfirmed|PAL CARE —/);
      expect(
        presentation.facts.length + presentation.sections.length,
      ).toBeGreaterThan(0);
    }
    expect(JSON.stringify(data)).toBe(before);
  });
  it("shows the exact mattress terms and respects the deadline rather than claiming eligibility", () => {
    expect(view(507).status).toBe("Window ended");
    expect(view(507, "2026-11-08T11:59:59Z").status).toBe("Return window open");
    expect(view(507, "2026-11-08T12:00:00Z").status).toBe("Window ended");
    expect(view(507).facts).toContainEqual({
      label: "Return deadline",
      value: "Nov 8, 2026, noon UTC",
    });
    expect(view(507).sections[0].items).toEqual([
      "Clean condition and original proof required.",
      "$20 restocking charge.",
    ]);
    expect(view(507).limitation).toContain(
      "not the retailer’s or manufacturer’s actual return policy",
    );
    expect(view(510).sections[0].items[0]).toContain(
      "opened and digital copies excluded",
    );
  });
  it("keeps returns, illustrated refunds, coverage exclusions and missing prices distinct", () => {
    expect(view(1206).status).toBe("Inspection pending");
    expect(view(1206).sections[0].items).toEqual([
      "Return agreed · November 1",
      "Parcel received · November 4",
      "Inspection pending",
    ]);
    expect(view(1206).sections[1].items).toEqual(["No refund confirmed."]);
    expect(view(1208).status).toBe("No PayPal refund confirmed");
    expect(view(1208).facts).toContainEqual({
      label: "Illustrated amount",
      value: "$24.95",
    });
    expect(view(506).sections).toContainEqual({
      title: "Exclusions",
      items: ["Ordinary wear and water damage."],
    });
    expect(view(505).facts).toContainEqual({
      label: "Base term ends",
      value: "Oct 20, 2027",
    });
    expect(view(504).facts).toContainEqual({
      label: "Actual purchase amount",
      value: "Not recorded",
    });
    expect(view(503).status).toBe("No official recall match established");
    expect(view(503).actions).toEqual([
      { label: "Review safety sources", href: `/safety?twinId=${demoId(203)}` },
    ]);
    expect(view(304).actions).toEqual([
      { label: "Open Product care", href: `/vault/${demoId(204)}/care` },
    ]);
    expect(view(303).status).toBe("Manufacturer instructions missing");
  });
  it("rejects altered, malformed, unknown or cross-purchase records without interpreting them", () => {
    const doc = data.documents.find((d) => d.id === demoId(507))!;
    const record = findTwin(data, doc.twinId)!;
    for (const changed of [
      { ...doc, content: doc.content.replace("20 restocking", "0 restocking") },
      { ...doc, content: '{"kind":"return-window"' },
      { ...doc, id: demoId(9999) },
      { ...doc, origin: "sandbox" },
      { ...doc, title: "Return approved" },
      { ...doc, twinId: demoId(206) },
    ]) {
      const p = documentPresentation(changed, record);
      expect(p.recognized).toBe(false);
      expect(p.facts).toEqual([]);
      expect(p.sections).toEqual([]);
    }
    expect(
      documentPresentation(doc, {
        ...record,
        twin: { ...record.twin, purchasePriceMinor: 1 },
      }).recognized,
    ).toBe(false);
    expect(documentPresentation(doc, record, "invalid").recognized).toBe(false);
    expect(
      documentPresentation(doc, {
        ...record,
        twin: { ...record.twin, currency: "EUR" },
      }).recognized,
    ).toBe(false);
    expect(
      documentPresentation(doc, {
        ...record,
        product: { ...record.product, currency: "EUR" },
      }).recognized,
    ).toBe(false);
  });
  it("renders a receipt only with matching Sandbox purchase evidence and never promotes its policy to verified coverage", () => {
    const record = structuredClone(findTwin(data, demoId(201))!);
    const product = {
      ...record.product,
      currency: "USD" as const,
      merchantName: "Everyday Goods",
      priceMinor: 12900,
    };
    record.twin = {
      ...record.twin,
      origin: "sandbox",
      id: demoId(999),
      checkoutOrderId: demoId(998),
      paypalOrderId: "TESTORDER12345",
      paypalCaptureId: "TESTCAPTURE12345",
      productSnapshot: product,
      purchasedOn: "2026-10-22",
      purchasePriceMinor: 12900,
      verifiedAt: "2026-10-22T12:01:00Z",
    };
    const doc = {
      id: demoId(997),
      twinId: record.twin.id,
      kind: "receipt",
      origin: "sandbox",
      title: "Everyday headphones · sandbox receipt",
      content: `PAL CARE — VERIFIED PAYPAL SANDBOX RECEIPT\nFictional product: ${product.brand} ${product.name} (${product.model})\nDemo merchant: Everyday Goods\nSandbox total: USD 129.00\nPayPal Sandbox order: TESTORDER12345\nPayPal Sandbox capture: TESTCAPTURE12345\nCapture timestamp: 2026-10-22T12:00:00Z\nServer verified: 2026-10-22T12:01:00Z\n\nGenerated by Pal Care from a retrieved, validated PayPal Sandbox capture. Simulated money only; not a real-money receipt, tax invoice, warranty or insurance. No payer identity is stored.`,
    };
    const p = documentPresentation(doc, record);
    expect(p.provenance).toBe("PayPal Sandbox · Verified");
    expect(p.recognized).toBe(true);
    expect(p.facts).toContainEqual({
      label: "Sandbox amount",
      value: "$129.00",
    });
    expect(
      documentPresentation(
        { ...doc, content: doc.content.replace("129.00", "149.00") },
        record,
      ).recognized,
    ).toBe(false);
    expect(
      documentPresentation(doc, {
        ...record,
        twin: { ...record.twin, paypalCaptureId: "OTHER" },
      }).recognized,
    ).toBe(false);
    const policy = documentPresentation(
      {
        ...doc,
        kind: "policy",
        origin: "sample",
        title: demoMerchantPolicy.title,
        content: demoMerchantPolicy.content,
      },
      record,
    );
    expect(policy.recognized).toBe(true);
    expect(policy.status).toBe("No coverage or refund promise");
    expect(policy.provenance).not.toContain("Verified");
  });
});
