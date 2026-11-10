import type { CustomerPurchase } from "./customer-model";

/** Selected, validated records only; unknown amounts never become free goods. */
export function selectionEvidence(purchases: CustomerPurchase[]) {
  const unique = [...new Map(purchases.map((p) => [p.id, p])).values()];
  return {
    ...purchaseTotals(unique),
    sampleMinor: unique.reduce(
      (sum, p) => sum + (p.origin === "sample" ? (p.amountMinor ?? 0) : 0),
      0,
    ),
    sandboxMinor: unique.reduce(
      (sum, p) => sum + (p.origin === "sandbox" ? (p.amountMinor ?? 0) : 0),
      0,
    ),
    unpriced: unique.filter((p) => p.amountMinor === null).length,
    careProducts: new Set(
      unique
        .filter((p) => p.careStatus === "available" && p.careHref)
        .map((p) => p.careHref),
    ).size,
    careUnavailable: unique.some((p) => p.careStatus === "unavailable"),
  };
}

/** Call only after native SDK/query/display postconditions pass. */
export function studioSelectionConfirmation(
  purchases: CustomerPurchase[],
  action: string,
) {
  const facts = selectionEvidence(purchases);
  const usd = (minor: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(minor / 100);
  const categories = [...new Set(purchases.map((p) => p.category))];
  return `${action} · ${categories.length === 1 ? categories[0] + " · " : ""}${facts.purchases} ${facts.purchases === 1 ? "purchase" : "purchases"} · Example purchase value ${usd(facts.sampleMinor)} · Verified Sandbox ${usd(facts.sandboxMinor)}${facts.unpriced ? ` · ${facts.unpriced} with no saved price left out of totals` : ""}.`;
}

/** Loaded-window facts only. Document links, not join counts, define the total. */
export function purchaseTotals(purchases: CustomerPurchase[]) {
  return {
    purchases: purchases.length,
    documents: new Set(
      purchases.flatMap((p) => p.documentLinks.map((d) => d.href)),
    ).size,
    verified: purchases.filter((p) => p.origin === "sandbox").length,
  };
}

export function purchaseHighlights(purchases: CustomerPurchase[]) {
  const receipt =
    purchases.find((p) => p.origin === "sandbox" && p.receiptHref) ??
    purchases.find((p) => p.receiptHref);
  const care = purchases.find(
    (p) => p.careStatus === "available" && p.careHref,
  );
  return [
    ...(receipt
      ? [
          {
            id: `receipt:${receipt.id}`,
            purchase: receipt,
            title: "Your saved receipt",
            label: "Open receipt",
            href: receipt.receiptHref!,
            kind: "receipt" as const,
          },
        ]
      : []),
    ...(care
      ? [
          {
            id: `care:${care.id}`,
            purchase: care,
            title: "Care guidance for your model",
            label: "Explore product care",
            href: care.careHref!,
            kind: "care" as const,
          },
        ]
      : []),
  ];
}
