import { createHash } from "node:crypto";
import { z } from "zod";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";

export const GUARDIAN_PRODUCT = "00000000-0000-4000-8000-000000000101";
export const GUARDIAN_POLICY_ID = "00000000-0000-4000-8000-000000000601";
export { CUSTOMER_ID, MERCHANT_ID };
export const rulesSchema = z.strictObject({
  version: z.literal("demo-price-v2"),
  merchantId: z.literal(MERCHANT_ID),
  productId: z.literal(GUARDIAN_PRODUCT),
  brand: z.literal("Forma"),
  model: z.literal("F-01"),
  currency: z.literal("USD"),
  quantity: z.literal(1),
  windowSeconds: z.literal(1209600),
  maxAdjustmentMinor: z.literal(2000),
  maxAdjustments: z.literal(1),
  fullPriceOnly: z.literal(true),
  requiresApproval: z.literal(true),
  engineVersion: z.literal("guardian-v1"),
});
export const guardianRules = rulesSchema.parse({
  version: "demo-price-v2",
  merchantId: MERCHANT_ID,
  productId: GUARDIAN_PRODUCT,
  brand: "Forma",
  model: "F-01",
  currency: "USD",
  quantity: 1,
  windowSeconds: 1209600,
  maxAdjustmentMinor: 2000,
  maxAdjustments: 1,
  fullPriceOnly: true,
  requiresApproval: true,
  engineVersion: "guardian-v1",
});
export const guardianTerms =
  "DEMO MERCHANT PRICE PROMISE — demo-price-v2\nEveryday Goods offers one merchant-approved price adjustment, up to USD 20.00, for a full-priced, quantity-one Forma F-01 purchase captured in PayPal Sandbox after this policy is activated. A lower published price must be for the same Everyday Goods SKU/variant in USD, observed after capture and before 14 × 24 hours have elapsed. Initial refund dispatch must occur before that deadline. Coupons, memberships, bundles, other retailers, shipping, taxes and already-refunded purchases are excluded. The original receipt and policy are never rewritten. Approval is required and no refund is completed until verified from PayPal. Fictional goods/funds only; nothing ships. This is not a PayPal benefit, warranty, insurance, coverage guarantee or real-commerce offer.";
export const guardianPolicy = {
  version: guardianRules.version,
  title: "Everyday Goods · demo price promise v2",
  content: guardianTerms,
};
export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export const guardianPolicyHash = hash({
  rules: guardianRules,
  terms: guardianTerms,
});
export function validatePolicy(rules: unknown, terms: string, digest: string) {
  const parsed = rulesSchema.safeParse(rules);
  return (
    parsed.success &&
    terms === guardianTerms &&
    digest === guardianPolicyHash &&
    hash({ rules: parsed.data, terms }) === digest
  );
}
export function offerHash(
  product: { id: string; priceMinor: number; currency: string },
  digest: string,
) {
  return hash({
    productId: product.id,
    priceMinor: product.priceMinor,
    currency: product.currency,
    policyHash: digest,
  });
}
