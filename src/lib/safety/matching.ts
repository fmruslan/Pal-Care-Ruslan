export type RecallIdentity = {
  brand: string;
  model: string;
  identifiersVerified: boolean;
  serial?: string;
  manufacturedAt?: string;
};
export type RecallRule = {
  brand: string;
  models: string[];
  restrictionsReviewed: boolean;
  requiresSerial: boolean;
  requiresDate: boolean;
  sourceUnchanged: boolean;
};
export type RecallDecision = {
  state:
    | "not_assessed"
    | "possible_match"
    | "identifiers_match"
    | "more_information"
    | "no_match";
  reason: string;
};
const normalize = (v: string) => v.normalize("NFKC").trim().toUpperCase();
export function matchRecall(
  identity: RecallIdentity,
  rule: RecallRule,
): RecallDecision {
  if (!rule.sourceUnchanged || !rule.restrictionsReviewed)
    return {
      state: "not_assessed",
      reason: "Source revision or applicability restrictions need review.",
    };
  if (normalize(identity.brand) !== normalize(rule.brand))
    return {
      state: "no_match",
      reason:
        "Brand does not match this reviewed notice. This is not a safety certification.",
    };
  if (!identity.model.trim())
    return {
      state: "possible_match",
      reason: "Brand matches, but exact model is missing.",
    };
  if (!rule.models.some((m) => normalize(m) === normalize(identity.model)))
    return {
      state: "no_match",
      reason:
        "Exact model does not match this notice. Other recalls have not been ruled out.",
    };
  // Merely supplying serial/date values never verifies that they fall in a notice's range.
  if (rule.requiresSerial || rule.requiresDate)
    return {
      state: "more_information",
      reason:
        "Serial, batch or date restrictions require independently validated applicability.",
    };
  if (!identity.identifiersVerified)
    return {
      state: "possible_match",
      reason:
        "Saved model appears in the official notice; the physical product identity has not been verified.",
    };
  return {
    state: "identifiers_match",
    reason:
      "Verified brand/model match this reviewed notice's identifiers. Follow the official source for remedy eligibility.",
  };
}
