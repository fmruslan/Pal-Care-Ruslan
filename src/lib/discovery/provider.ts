import { z } from "zod";
import {
  productIdSchema,
  queries,
  limits,
  type Alternative,
  type DiscoveryCategory,
} from "./contracts";
const retailers = new Set([
  "bestbuy.com",
  "walmart.com",
  "amazon.com",
  "target.com",
]);
export function safeOfferUrl(value: string, domain: string) {
  try {
    const url = new URL(value);
    const d = domain.toLowerCase().replace(/^www\./, "");
    if (
      !retailers.has(d) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    if (
      ![
        d,
        `www.${d}`,
        "www.buy.trychannel3.com",
        "buy.trychannel3.com",
      ].includes(url.hostname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function priceMinor(value: number) {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("invalid_offer_price");
  const [whole, cents = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 1000000)
    throw new Error("invalid_offer_price");
  return minor;
}
const price = z
  .object({
    price: z.number().optional(),
    amount: z.number().optional(),
    currency: z.literal("USD"),
  })
  .refine((v) => v.price !== undefined || v.amount !== undefined)
  .refine(
    (v) =>
      v.price === undefined || v.amount === undefined || v.price === v.amount,
  );
const offer = z.object({
  url: z.string().max(2000),
  domain: z.string().max(200),
  price,
  availability: z.enum(["InStock", "OutOfStock"]),
  condition: z.enum(["new", "used", "refurbished"]).nullish(),
});
const product = z.object({
  id: productIdSchema,
  title: z.string().min(1).max(300),
  brands: z
    .array(z.object({ name: z.string().max(100) }))
    .max(10)
    .default([]),
  offers: z.array(z.unknown()).max(50).default([]),
  category: z.object({ title: z.string().max(200) }).nullish(),
});
export function normalizeProduct(
  raw: unknown,
  category: DiscoveryCategory,
  checkedAt: string,
): Alternative[] {
  const p = product.parse(raw);
  const acceptedTitles =
    category === "headphones"
      ? [
          "headphones",
          "over-ear headphones",
          "on-ear headphones",
          "noise-cancelling headphones",
        ]
      : ["air fryers", "air fryer ovens", "air fryers & ovens"];
  if (
    !p.category ||
    !acceptedTitles.includes(p.category.title.trim().toLowerCase())
  )
    return [];
  // Known recalled model tokens are excluded conservatively; absence is NOT a safety certification.
  if (/\bNS-AF(?:34D2|5DSS2|5MSS2|8DBD2|10DBK2|10DSS2)\b/i.test(p.title))
    return [];
  return p.offers.flatMap((rawOffer) => {
    const result = offer.safeParse(rawOffer);
    if (!result.success) return [];
    const o = result.data;
    let minor: number;
    try {
      minor = priceMinor(o.price.price ?? o.price.amount!);
    } catch {
      return [];
    }
    const href = safeOfferUrl(o.url, o.domain);
    if (
      !href ||
      minor > limits[category] ||
      o.availability !== "InStock" ||
      o.condition !== "new"
    )
      return [];
    return [
      {
        id: p.id,
        title: p.title,
        brand: p.brands.map((b) => b.name).join(", ") || "Brand not supplied",
        amountMinor: minor,
        currency: "USD" as const,
        availability: "Provider reports in stock · confirm at retailer",
        condition: "Provider reports new",
        retailer: o.domain,
        href,
        checkedAt,
        provenance: "channel3" as const,
        reason:
          "Within the selected budget. Compatibility and complete recall coverage are not established.",
      },
    ];
  });
}
export class Channel3Gateway {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, body?: unknown) {
    const response = await this.transport(
      `https://api.trychannel3.com${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          "x-api-key": this.key,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(12000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error(
        `channel3_http_${[401, 402, 429].includes(response.status) ? response.status : "unavailable"}`,
      );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("channel3_invalid_response");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1000000) throw new Error("channel3_response_too_large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  }
  async search(category: DiscoveryCategory) {
    const raw = await this.request("/v1/search", {
      query: queries[category],
      limit: 3,
      filters: {
        conditions: ["new"],
        availability: ["InStock"],
        price: { max_price: limits[category] / 100 },
        website_ids: [...retailers],
      },
      config: {
        country: "US",
        currency: "USD",
        language: "en",
        mode: "keyword",
      },
    });
    return z.object({ products: z.array(product).max(30) }).parse(raw).products;
  }
  async retrieve(id: string) {
    const parsed = productIdSchema.parse(id);
    return product.parse(
      await this.request(`/v1/products/${encodeURIComponent(parsed)}`),
    );
  }
}
