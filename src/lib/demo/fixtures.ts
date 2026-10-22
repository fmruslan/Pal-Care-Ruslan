import type { DemoData } from "../../db/schema";

export const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
export const MERCHANT_ID = "00000000-0000-4000-8000-000000000002";

// Original fictional brands, products and documents. No personal data, manufacturer
// claims, real recall assertions, or fabricated PayPal transaction identifiers.
export const demoData: DemoData = {
  customer: { id: CUSTOMER_ID, name: "Alex", kind: "fictional" },
  merchant: { id: MERCHANT_ID, name: "Everyday Goods", kind: "fictional" },
  products: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      merchantId: MERCHANT_ID,
      name: "Everyday headphones",
      brand: "Forma",
      model: "F-01",
      category: "Audio",
      illustration: "headphones",
      priceMinor: 12900,
      currency: "USD",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      merchantId: MERCHANT_ID,
      name: "Pour-over kettle",
      brand: "Hearth",
      model: "H-02",
      category: "Kitchen",
      illustration: "kettle",
      priceMinor: 8900,
      currency: "USD",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      merchantId: MERCHANT_ID,
      name: "Everywhere speaker",
      brand: "Forma",
      model: "F-03",
      category: "Audio",
      illustration: "speaker",
      priceMinor: 6900,
      currency: "USD",
    },
  ],
  twins: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      customerId: CUSTOMER_ID,
      merchantId: MERCHANT_ID,
      productId: "00000000-0000-4000-8000-000000000101",
      purchasedOn: "2026-10-18",
      purchasePriceMinor: 14900,
      currency: "USD",
      origin: "sample",
      checkoutOrderId: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      verifiedAt: null,
      productSnapshot: null,
      createdAt: "2026-10-18T12:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      customerId: CUSTOMER_ID,
      merchantId: MERCHANT_ID,
      productId: "00000000-0000-4000-8000-000000000102",
      purchasedOn: "2026-10-12",
      purchasePriceMinor: 8900,
      currency: "USD",
      origin: "sample",
      checkoutOrderId: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      verifiedAt: null,
      productSnapshot: null,
      createdAt: "2026-10-12T12:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000203",
      customerId: CUSTOMER_ID,
      merchantId: MERCHANT_ID,
      productId: "00000000-0000-4000-8000-000000000103",
      purchasedOn: "2026-10-08",
      purchasePriceMinor: 6900,
      currency: "USD",
      origin: "sample",
      checkoutOrderId: null,
      paypalOrderId: null,
      paypalCaptureId: null,
      verifiedAt: null,
      productSnapshot: null,
      createdAt: "2026-10-08T12:00:00Z",
    },
  ],
  documents: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      twinId: "00000000-0000-4000-8000-000000000201",
      title: "Headphones · sample receipt",
      kind: "receipt",
      origin: "sample",
      content:
        "PAL CARE — SAMPLE RECEIPT\nFictional merchant: Everyday Goods\nFictional product: Forma Everyday headphones F-01\nIllustrative purchase date: 2026-10-18\nIllustrative total: USD 149.00\n\nSAMPLE DATA ONLY. This is not a PayPal receipt, proof of payment, warranty, or tax invoice. No payment was processed.",
    },
    {
      id: "00000000-0000-4000-8000-000000000302",
      twinId: "00000000-0000-4000-8000-000000000202",
      title: "Kettle · sample receipt",
      kind: "receipt",
      origin: "sample",
      content:
        "PAL CARE — SAMPLE RECEIPT\nFictional merchant: Everyday Goods\nFictional product: Hearth Pour-over kettle H-02\nIllustrative purchase date: 2026-10-12\nIllustrative total: USD 89.00\n\nSAMPLE DATA ONLY. No payment was processed. Not proof of payment or coverage.",
    },
    {
      id: "00000000-0000-4000-8000-000000000303",
      twinId: "00000000-0000-4000-8000-000000000203",
      title: "Speaker · sample care card",
      kind: "care-card",
      origin: "sample",
      content:
        "PAL CARE — SAMPLE CARE CARD\nFictional product: Forma Everywhere speaker F-03\n\nThis original demo document illustrates where product documentation will live. It is not a manufacturer manual and contains no verified product-specific instructions. Source-grounded AI care is not implemented in Stage 1.",
    },
  ],
  events: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      twinId: "00000000-0000-4000-8000-000000000201",
      kind: "price",
      title: "A price-change example",
      description:
        "The sample catalog shows $129 against a $149 sample purchase. Eligibility checks, merchant approval and PayPal refunds are not connected yet.",
      occurredOn: "2026-10-21",
      origin: "sample",
    },
    {
      id: "00000000-0000-4000-8000-000000000402",
      twinId: "00000000-0000-4000-8000-000000000202",
      kind: "return",
      title: "A return-window example",
      description:
        "A sample reminder shows how a merchant's recorded return terms could appear. No live deadline tracking or coverage is active.",
      occurredOn: "2026-10-20",
      origin: "sample",
    },
    {
      id: "00000000-0000-4000-8000-000000000403",
      twinId: "00000000-0000-4000-8000-000000000203",
      kind: "care",
      title: "A home for product care",
      description:
        "A sample care card is attached to this Purchase Twin. Manufacturer-manual retrieval and AI answers arrive in a later stage.",
      occurredOn: "2026-10-19",
      origin: "sample",
    },
  ],
};
