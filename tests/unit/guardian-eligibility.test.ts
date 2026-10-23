import { describe, expect, it } from "vitest";
import {
  eligible,
  type EligibilityInput,
} from "../../src/lib/price-guardian/eligibility";
import {
  guardianRules,
  guardianTerms,
  guardianPolicyHash,
  GUARDIAN_PRODUCT,
  MERCHANT_ID,
} from "../../src/lib/price-guardian/policy";

const now = Date.parse("2026-10-24T12:00:00Z");
const input = (): EligibilityInput => ({
  origin: "sandbox",
  merchantId: MERCHANT_ID,
  productId: GUARDIAN_PRODUCT,
  brand: "Forma",
  model: "F-01",
  currency: "USD",
  originalMinor: 12900,
  quantity: 1,
  fullPrice: true,
  capturedAt: "2026-10-23T12:00:00Z",
  binding: {
    rules: guardianRules,
    terms: guardianTerms,
    hash: guardianPolicyHash,
    approvedAt: "2026-10-23T10:00:00Z",
    orderCreatedAt: "2026-10-23T11:00:00Z",
    boundAt: "2026-10-23T11:00:00Z",
  },
  price: {
    merchantId: MERCHANT_ID,
    productId: GUARDIAN_PRODUCT,
    currency: "USD",
    minor: 10900,
    previousMinor: 12900,
    observedAt: "2026-10-24T11:00:00Z",
  },
  hasPriorAdjustment: false,
  now,
});
describe("Price Guardian deterministic promise", () => {
  it("proposes exactly USD 20 for 129 → 109 and caps larger drops", () => {
    expect(eligible(input()).amountMinor).toBe(2000);
    const i = input();
    i.price.minor = 9900;
    expect(eligible(i).amountMinor).toBe(2000);
  });
  it("never retroactively covers legacy policies or unverified samples", () => {
    expect(eligible({ ...input(), binding: null }).reason).toBe(
      "policy_not_covered",
    );
    expect(eligible({ ...input(), origin: "sample" }).eligible).toBe(false);
    const i = input();
    i.binding!.terms = "silently edited";
    expect(eligible(i).eligible).toBe(false);
  });
  it.each([
    "merchant",
    "variant",
    "currency",
    "quantity",
    "discount",
    "already",
    "deadline",
    "before",
    "invalid",
    "increase",
    "policy_after",
  ])("rejects %s exclusions", (kind) => {
    const i = input();
    if (kind === "merchant") i.price.merchantId = "other";
    if (kind === "variant") i.model = "F-03";
    if (kind === "currency") i.price.currency = "EUR";
    if (kind === "quantity") i.quantity = 2;
    if (kind === "discount") i.fullPrice = false;
    if (kind === "already") i.hasPriorAdjustment = true;
    if (kind === "deadline") i.now = Date.parse(i.capturedAt) + 14 * 86400000;
    if (kind === "before") i.price.observedAt = i.capturedAt;
    if (kind === "invalid") i.originalMinor = 12900.5;
    if (kind === "increase") i.price.minor = 14900;
    if (kind === "policy_after") i.binding!.approvedAt = i.capturedAt;
    expect(eligible(i).eligible).toBe(false);
  });
});
