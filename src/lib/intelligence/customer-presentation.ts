import type { CustomerPurchase } from "./customer-model";

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
            title: "Your saved receipt, ready to open.",
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
            title: "Matched product guidance, with sources.",
            label: "Explore product care",
            href: care.careHref!,
            kind: "care" as const,
          },
        ]
      : []),
  ];
}
