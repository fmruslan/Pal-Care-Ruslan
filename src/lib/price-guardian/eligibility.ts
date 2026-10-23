import {
  guardianRules,
  validatePolicy,
  MERCHANT_ID,
  GUARDIAN_PRODUCT,
} from "./policy";

export type EligibilityInput = {
  origin: string;
  merchantId: string;
  productId: string;
  brand: string;
  model: string;
  currency: string;
  originalMinor: number;
  quantity: number;
  fullPrice: boolean;
  capturedAt: string;
  binding: {
    rules: unknown;
    terms: string;
    hash: string;
    approvedAt: string;
    boundAt: string;
    orderCreatedAt: string;
  } | null;
  price: {
    merchantId: string;
    productId: string;
    currency: string;
    minor: number;
    previousMinor: number;
    observedAt: string;
  };
  hasPriorAdjustment: boolean;
  now: number;
};
export function eligible(input: EligibilityInput) {
  const no = (reason: string) => ({
    eligible: false as const,
    reason,
    amountMinor: 0,
    expiresAt: null,
  });
  const binding = input.binding;
  if (!binding || !validatePolicy(binding.rules, binding.terms, binding.hash))
    return no("policy_not_covered");
  if (input.origin !== "sandbox") return no("purchase_not_verified");
  if (
    input.merchantId !== MERCHANT_ID ||
    input.price.merchantId !== input.merchantId
  )
    return no("merchant_mismatch");
  if (
    input.productId !== GUARDIAN_PRODUCT ||
    input.price.productId !== input.productId ||
    input.brand !== guardianRules.brand ||
    input.model !== guardianRules.model
  )
    return no("variant_mismatch");
  if (input.currency !== "USD" || input.price.currency !== "USD")
    return no("currency_mismatch");
  if (input.quantity !== 1 || !input.fullPrice)
    return no("purchase_conditions_excluded");
  if (
    !Number.isSafeInteger(input.originalMinor) ||
    input.originalMinor < 1 ||
    input.originalMinor > 20000 ||
    !Number.isSafeInteger(input.price.minor) ||
    input.price.minor < 1 ||
    input.price.minor > 20000 ||
    !Number.isSafeInteger(input.price.previousMinor) ||
    input.price.previousMinor < 1 ||
    input.price.previousMinor > 20000
  )
    return no("invalid_amount");
  const capture = Date.parse(input.capturedAt),
    observation = Date.parse(input.price.observedAt);
  const approval = Date.parse(binding.approvedAt),
    bound = Date.parse(binding.boundAt),
    created = Date.parse(binding.orderCreatedAt);
  if (
    ![capture, observation, approval, bound, created, input.now].every(
      Number.isFinite,
    ) ||
    approval > created ||
    bound < created ||
    bound > capture ||
    capture > input.now ||
    observation > input.now
  )
    return no("invalid_timeline");
  const expires = capture + guardianRules.windowSeconds * 1000;
  if (input.now >= expires || observation >= expires)
    return no("window_expired");
  if (observation <= capture) return no("price_not_after_purchase");
  if (input.hasPriorAdjustment) return no("adjustment_already_used");
  if (
    input.price.minor >= input.originalMinor ||
    input.price.previousMinor <= input.price.minor
  )
    return no("price_not_lower");
  return {
    eligible: true as const,
    reason: "eligible",
    amountMinor: Math.min(
      input.originalMinor - input.price.minor,
      guardianRules.maxAdjustmentMinor,
    ),
    expiresAt: new Date(expires).toISOString(),
  };
}
