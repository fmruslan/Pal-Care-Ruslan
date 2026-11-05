import type { DemoData } from "../../../db/schema";
import {
  demoScenarioSchema,
  retailReferenceSchema,
  type DemoCarePack,
} from "./contracts";

export const demoId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const checkedAt = "2026-11-05T04:52:18Z";
const snapshot =
  "Dated US listing snapshot; not a live quote. Taxes, shipping, location, availability and promotions may differ. No merchant policy or adjustment eligibility is established.";
const references = [
  {
    product: 104,
    retailer: "PiShop.us",
    seller: "PiShop.us",
    brand: "Raspberry Pi",
    model: "5 / SC1112",
    variant: "8GB RAM, board only, new; retailer SKU 8GB-9028",
    price: 17500,
    url: "https://www.pishop.us/product/raspberry-pi-5-8gb/",
    match: "comparable",
    reason:
      "Original ownership does not specify RAM; this 8GB board is a comparable variant, not confirmed identical.",
    quote: "Raspberry Pi 5/8GB · $175.00 · Condition: New",
    direct: true,
  },
  {
    product: 101,
    retailer: "Sony US",
    seller: "Sony",
    brand: "Sony",
    model: "WH-CH720N/B",
    variant: "Black, wireless noise-cancelling over-ear headphones, new",
    price: 8999,
    url: "https://electronics.sony.com/audio/headphones/headband/p/whch720n-b",
    match: "comparable",
    reason:
      "Sony WH-CH720N/B is comparable to fictional Forma F-01, not the same product.",
    quote:
      "WH-CH720N Wireless Noise Cancelling Headphone | Black. Model: WH-CH720N/B. Sale Price $89.99.",
    direct: false,
  },
  {
    product: 102,
    retailer: "Fellow",
    seller: "Fellow",
    brand: "Fellow",
    model: "Stagg Pour-Over Kettle",
    variant: "Matte Black, stovetop, 1 litre; listed variant sold out",
    price: 8995,
    url: "https://fellowproducts.com/products/stagg",
    match: "comparable",
    reason:
      "Fellow Stagg is a comparable kettle, not the fictional Hearth H-02.",
    quote:
      "Stagg Pour-Over Kettle · Regular price $89.95 · Matte Black · Variant sold out or unavailable",
    direct: true,
  },
  {
    product: 103,
    retailer: "Walmart",
    seller: "OneCall (Authorized Dealer); fulfilled by Walmart",
    brand: "JBL",
    model: "Flip 6",
    variant: "Black, new, portable speaker",
    price: 11495,
    url: "https://www.walmart.com/ip/JBL-Flip-6-Portable-Waterproof-Speaker-Black/295234824",
    match: "comparable",
    reason:
      "JBL Flip 6 is comparable to fictional Forma F-03; no identity or safety evidence is shared.",
    quote:
      "Black · $114.95 · Condition New · Sold by OneCall (Authorized Dealer)",
    direct: true,
  },
  {
    product: 105,
    retailer: "The Home Depot",
    seller: "The Home Depot",
    brand: "Whirlpool",
    model: "WRT311FZDW",
    variant: "White, 33-inch class, 20.5 cu. ft., top freezer",
    price: 109900,
    url: "https://www.homedepot.com/p/Whirlpool-33-in-20-5-cu-ft-Wide-Top-Freezer-Refrigerator-in-White-with-Frameless-Glass-Shelves-WRT311FZDW/205658420",
    match: "model-variant",
    reason:
      "Model and white finish match the new fictional purchase description; ownership/payment is still fictional.",
    quote:
      "33 in. 20.5 cu. ft. Wide Top Freezer Refrigerator in White · WRT311FZDW · $1,099.00",
    direct: false,
  },
  {
    product: 106,
    retailer: "Timberland US",
    seller: "Timberland",
    brand: "Timberland",
    model: "TB110061713",
    variant: "Men's Premium 6-Inch Waterproof Boot, Wheat; size not selected",
    price: 22000,
    url: "https://www.timberland.com/en-us/p/men/footwear-10039/mens-timberland-premium-6-inch-waterproof-boot-TB110061713",
    match: "model-variant",
    reason:
      "Style and color match the fictional purchase description; size-specific availability is unverified.",
    quote:
      "Color: Wheat · Men's Timberland Premium 6-Inch Waterproof Boot · Price: $220.00 · Style TB110061713",
    direct: false,
  },
  {
    product: 107,
    retailer: "Walmart",
    seller: "Walmart.com",
    brand: "Zinus",
    model: "WMGTE-12Q",
    variant: "Green Tea Waterfall, Queen, 12-inch memory foam, new",
    price: 23800,
    url: "https://www.walmart.com/ip/ZINUS-12-GT-FOAM-Q/17057015205",
    match: "model-variant",
    reason:
      "Queen and 12-inch variant match the fictional purchase; no real return or warranty entitlement is implied.",
    quote:
      "Bed Size: Queen · Mattress Thickness: 12 in · Current price is USD$238.00 · Sold and shipped by Walmart.com",
    direct: true,
  },
  {
    product: 108,
    retailer: "Porchlight Book Company",
    seller: "Porchlight Book Company",
    brand: "Basic Books",
    model: "ISBN 9780465050659",
    variant:
      "The Design of Everyday Things, revised/expanded, paperback, English",
    price: 2199,
    url: "https://www.porchlightbooks.com/products/design-of-everyday-things-revised-expanded-don-norman-9780465050659",
    match: "comparable",
    reason:
      "This is a paperback reference for a fictional hardcover, not an identical edition or binding.",
    quote: "Paperback · Regular price $21.99 · ISBN 9780465050659",
    direct: true,
  },
  {
    product: 109,
    retailer: "Apple US",
    seller: "Apple",
    brand: "Apple",
    model: "iPhone 16",
    variant: "6.1-inch, 128GB, Ultramarine, connect to any carrier later",
    price: 82900,
    url: "https://www.apple.com/shop/buy-iphone/iphone-16/6.1-inch-display-128gb-ultramarine-unlocked",
    match: "model-variant",
    reason:
      "Storage, finish and carrier-later configuration match the fictional purchase; not the conditional carrier-advertised starting price.",
    quote: "Ultramarine · Connect to any carrier later · $829.00",
    direct: true,
  },
  {
    product: 110,
    retailer: "Walmart",
    seller: "Walmart.com",
    brand: "Nintendo",
    model: "The Legend of Zelda: Tears of the Kingdom",
    variant:
      "Nintendo Switch, physical standard edition, new; not Switch 2 or digital",
    price: 5699,
    url: "https://www.walmart.com/ip/The-Legend-of-Zelda-Tears-of-the-Kingdom-Nintendo-Switch/1481578625",
    match: "model-variant",
    reason:
      "Platform, physical format and new condition match the fictional purchase description; opening/return eligibility remains unknown.",
    quote:
      "The Legend of Zelda: Tears of the Kingdom - Nintendo Switch · New $56.99 · Sold and shipped by Walmart.com",
    direct: true,
  },
] as const;

export const demoProducts = [
  {
    n: 105,
    name: "Refrigerator",
    brand: "Whirlpool",
    model: "WRT311FZDW · White",
    category: "Kitchen",
    illustration: "refrigerator",
    minor: 119900,
  },
  {
    n: 106,
    name: "Leather boots",
    brand: "Timberland",
    model: "TB110061713 · Wheat",
    category: "Clothing",
    illustration: "boots",
    minor: 19900,
  },
  {
    n: 107,
    name: "Mattress",
    brand: "Zinus",
    model: "WMGTE-12Q · Queen · 12-inch",
    category: "Home",
    illustration: "mattress",
    minor: 26900,
  },
  {
    n: 108,
    name: "Hardcover book",
    brand: "Pal Press (fictional)",
    model: "Design Notes HC-01",
    category: "Books",
    illustration: "book",
    minor: 2495,
  },
  {
    n: 109,
    name: "iPhone",
    brand: "Apple",
    model: "iPhone 16 · 128GB · Ultramarine · carrier later",
    category: "Computing",
    illustration: "phone",
    minor: 87900,
  },
  {
    n: 110,
    name: "Video game",
    brand: "Nintendo",
    model: "Tears of the Kingdom · Switch · physical · new",
    category: "Games",
    illustration: "game",
    minor: 6499,
  },
] as const;

const base = (n: number) => ({
  id: demoId(n + 600),
  twinId: demoId(n + 100),
  productId: demoId(n),
  documentId: demoId(n + 400),
  simulated: true as const,
});
const startsAt = "2026-10-20T12:00:00Z";
export const tenProductPack: DemoCarePack = {
  id: demoId(900),
  version: "care-ten-v1",
  asOf: "2026-11-05T12:00:00.000Z",
  references: references.map((r, i) =>
    retailReferenceSchema.parse({
      id: demoId(800 + i),
      productId: demoId(r.product),
      kind: "retail-reference",
      retailer: r.retailer,
      seller: r.seller,
      url: r.url,
      brand: r.brand,
      model: r.model,
      variant: r.variant,
      match: r.match,
      matchReason: r.reason,
      priceMinor: r.price,
      currency: "USD",
      checkedAt,
      retrieval: r.direct ? "direct-page" : "retailer-search-extract",
      quote: r.quote,
      limitations: `${snapshot}${r.direct ? "" : " Retailer search extract only; direct retrieval was denied (403)."}`,
    }),
  ),
  scenarios: [
    {
      ...base(104),
      kind: "price",
      startsAt,
      endsAt: "2026-11-10T12:00:00Z",
      hypotheticalPurchaseMinor: 18900,
      monitoringExample: false,
      terms:
        "Fictional demonstration policy only: a hypothetical 8GB board purchase for $189.00 may be reviewed within the example window. Original Pi ownership is unpriced. Neither this policy nor the independent retail reference establishes an actual adjustment.",
      observations: [
        {
          at: "2026-11-03T12:00:00Z",
          priceMinor: 18900,
          variant: "Pi 5 8GB demo catalog",
        },
        {
          at: "2026-11-04T12:00:00Z",
          priceMinor: 17900,
          variant: "Pi 5 8GB demo catalog",
        },
      ],
    },
    {
      ...base(105),
      kind: "warranty",
      startsAt,
      endsAt: "2029-10-20T12:00:00Z",
      extended: true,
      terms:
        "Fictional Everyday Goods extended plan EG-FRIDGE-3: base term ends 2027-10-20; extension runs to 2029-10-20. Mechanical faults only; misuse and consumables excluded. Not a Whirlpool or Home Depot promise.",
    },
    {
      ...base(101),
      kind: "warranty",
      startsAt: "2026-10-18T12:00:00Z",
      endsAt: "2027-10-18T12:00:00Z",
      extended: false,
      terms:
        "Fictional Forma sample-purchase protection example. Defects only; accidental damage excluded. This example binds only the original sample Twin, not the separate verified Sandbox purchase.",
    },
    {
      ...base(102),
      kind: "delivery",
      estimatedAt: "2026-11-07T18:00:00Z",
      updates: [
        { at: "2026-11-03T12:00:00Z", status: "prepared" },
        { at: "2026-11-04T12:00:00Z", status: "dispatched" },
        { at: "2026-11-05T09:00:00Z", status: "in-transit" },
      ],
    },
    {
      ...base(103),
      kind: "safety",
      officialMatch: false,
      terms:
        "Simulated notice for fictional Forma F-03. No official recall match is established. Check official CPSC source, exact brand/model and physical batch/serial restrictions. Existing reviewed Insignia evidence is historical and unrelated; no comprehensive fresh search or safety all-clear.",
    },
    {
      ...base(106),
      kind: "warranty",
      startsAt,
      endsAt: "2027-10-20T12:00:00Z",
      extended: false,
      terms:
        "Fictional Everyday Goods one-year stitching-defect warranty; ordinary wear and water damage excluded. Not Timberland's actual warranty.",
    },
    {
      ...base(107),
      kind: "return-window",
      startsAt,
      endsAt: "2026-11-08T12:00:00Z",
      condition: "unknown",
      requiresUnopened: false,
      terms:
        "Fictional Everyday Goods return example: exact UTC deadline, clean condition and original proof required; $20 restocking charge. No real Walmart or Zinus return entitlement; merchant acceptance unknown.",
    },
    {
      ...base(108),
      kind: "gap",
      terms:
        "A fictional receipt is saved, but no applicable protection policy is recorded. A comparable paperback listing cannot verify this hardcover's coverage.",
    },
    {
      ...base(109),
      kind: "price",
      startsAt,
      endsAt: "2026-11-15T12:00:00Z",
      hypotheticalPurchaseMinor: 87900,
      monitoringExample: true,
      terms:
        "Saved simulated monitoring example, not a running external tracker or Apple policy. Fictional Everyday Goods same-variant terms only. Actual eligibility is unverified.",
      observations: [
        {
          at: "2026-11-03T12:00:00Z",
          priceMinor: 87900,
          variant: "iPhone 16 128GB Ultramarine demo catalog",
        },
        {
          at: "2026-11-04T12:00:00Z",
          priceMinor: 87900,
          variant: "iPhone 16 128GB Ultramarine demo catalog",
        },
      ],
    },
    {
      ...base(110),
      kind: "return-window",
      startsAt,
      endsAt: "2026-11-07T12:00:00Z",
      condition: "unknown",
      requiresUnopened: true,
      terms:
        "Fictional Everyday Goods return example: unopened physical Switch game required; opened/digital copies excluded. Original receipt and merchant acceptance required. Item condition is unknown; no real Walmart policy is asserted.",
    },
  ].map((r) => demoScenarioSchema.parse(r)),
};

/** Additive fixture data only; never used as a database outage fallback. */
export function withTenProductFixtures(original: DemoData): DemoData {
  const products = demoProducts.map((p) => ({
    id: demoId(p.n),
    merchantId: original.merchant.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    category: p.category,
    illustration: p.illustration,
    priceMinor: p.minor,
    currency: "USD",
  }));
  const twins = demoProducts.map((p) => ({
    id: demoId(p.n + 100),
    productId: demoId(p.n),
    customerId: original.customer.id,
    merchantId: original.merchant.id,
    purchasedOn: "2026-10-20",
    purchasePriceMinor: p.minor,
    currency: "USD",
    origin: "sample",
    checkoutOrderId: null,
    paypalOrderId: null,
    paypalCaptureId: null,
    verifiedAt: null,
    productSnapshot: null,
    createdAt: startsAt,
  }));
  const receipts = demoProducts.map((p) => ({
    id: demoId(p.n + 200),
    twinId: demoId(p.n + 100),
    kind: "receipt",
    origin: "sample",
    title: `${p.name} · fictional demo receipt`,
    content: `PAL CARE — FICTIONAL DEMO RECEIPT\n${p.name} · ${p.brand} · ${p.model}\nFictional merchant: Everyday Goods\nIllustrative purchase: 2026-10-20\nIllustrative total USD ${(p.minor / 100).toFixed(2)}\nSAMPLE DATA ONLY. No payment was processed. Not a PayPal receipt, proof of payment or coverage.`,
  }));
  const evidence = tenProductPack.scenarios.map((s) => ({
    id: s.documentId,
    twinId: s.twinId,
    kind: "care-card",
    origin: "sample",
    title: `${s.kind} · simulated Care evidence`,
    content: `PAL CARE — SIMULATED EXAMPLE\nAs of ${tenProductPack.asOf}\nNot original purchase terms, a real merchant promise, carrier event, recall confirmation or financial permission.\n${JSON.stringify(s, null, 2)}`,
  }));
  return {
    ...original,
    products: [...original.products, ...products],
    twins: [...original.twins, ...twins],
    documents: [...original.documents, ...receipts, ...evidence],
    demoCare: structuredClone(tenProductPack),
  };
}
