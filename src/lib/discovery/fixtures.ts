import type { Alternative, DiscoveryCategory } from "./contracts";
export function illustrativeAlternatives(
  category: DiscoveryCategory,
): Alternative[] {
  return ["Care-first profile", "Repairable profile", "Budget profile"].map(
    (name, i) => ({
      id: `sample-${category}-${i}`,
      title: `${name} · illustrative ${category === "headphones" ? "headphones" : "air fryer"}`,
      brand: "Fictional comparison profile",
      amountMinor: null,
      currency: "USD",
      availability: "Not checked",
      condition: "Not checked",
      retailer: null,
      href: null,
      checkedAt: null,
      provenance: "illustrative",
      reason:
        i === 0
          ? "Prioritize care instructions and replaceable parts."
          : i === 1
            ? "Look for documented repair/service support; do not infer it from a title."
            : "Compare total cost and retailer terms. No market price or compatibility is established.",
    }),
  );
}
