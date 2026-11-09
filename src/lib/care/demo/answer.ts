import type { CareAnswer } from "../../careos/contracts";
import type { CareFeed } from "../model";
import { money } from "../../demo/presentation";
import { priceComparison } from "./model";

export function demoEvidenceAnswer(
  feed: CareFeed,
  revision: number,
  ids: string[],
  topic: string,
): CareAnswer | null {
  if (
    !["retail-reference", "lower-reference", "closing-windows"].includes(topic)
  )
    return null;
  const purchases = feed.purchases.filter((p) => ids.includes(p.id));
  const prices = purchases.flatMap((p) => {
    const reference = feed.retailReferences.find(
      (r) => r.productId === p.productId,
    );
    if (
      !reference ||
      (topic === "lower-reference" &&
        (p.amountMinor === null || reference.priceMinor >= p.amountMinor))
    )
      return [];
    return [{ p, reference }];
  });
  const windows = feed.ownership
    .filter((v) => ids.includes(v.twinId))
    .flatMap((v) =>
      v.facts
        .filter((f) => {
          if (
            !["warranty", "return-window", "price-window"].includes(f.topic) ||
            !f.date
          )
            return false;
          const now = Date.parse(feed.observedAt);
          const remaining = Date.parse(f.date) - now;
          return (
            remaining > 0 &&
            remaining <= (f.topic === "warranty" ? 30 : 7) * 86400000
          );
        })
        .map((f) => ({ v, f })),
    );
  const selected =
    topic === "closing-windows"
      ? [...new Set(windows.map(({ v }) => v.twinId))]
      : prices.map(({ p }) => p.id);
  const matching = purchases.filter((p) => selected.includes(p.id));
  return {
    outcome:
      !feed.complete || feed.unavailable.length
        ? "unavailable"
        : selected.length
          ? "answered"
          : "missing",
    mode: "deterministic",
    revision,
    questionScope: matching.length === 1 ? "purchase" : "library",
    context:
      matching.length === 1
        ? {
            twinId: matching[0].id,
            name: matching[0].name,
            model: matching[0].model,
            purchasedOn: matching[0].purchasedOn,
            origin: matching[0].origin,
          }
        : null,
    careSelection: selected,
    text:
      topic === "closing-windows"
        ? `${windows.length ? "These saved windows are approaching their stated cutoffs" : "No approaching saved return or warranty cutoff was found in the available records"}, evaluated against the current UTC view time. Simulated examples retain their original snapshot and do not establish actual eligibility. No request was submitted.`
        : "Retail reference prices are dated snapshots, not live prices or amounts paid. Comparable products are not verified identical. A lower listing alone never establishes a price-drop event, merchant eligibility or savings; identity, merchant policy, timing and condition still require validation.",
    steps:
      topic === "closing-windows"
        ? windows
            .slice(0, 16)
            .map(
              ({ v, f }) =>
                `${v.purchase.name} (${v.purchase.purchasedOn}) — ${f.status}. ${f.detail}`,
            )
        : prices
            .slice(0, 16)
            .map(
              ({ p, reference: r }) =>
                `${p.name} (${p.purchasedOn}) — ${p.amountMinor === null ? "Purchase amount unavailable, not $0" : `${p.origin === "sandbox" ? "Verified Sandbox" : "Sample fictional"} purchase amount ${money(p.amountMinor)}`}. Retail reference ${money(r.priceMinor)} USD · ${r.retailer} · seller ${r.seller} · ${r.brand} ${r.model} · ${r.variant} · checked ${r.checkedAt}. ${r.match === "comparable" ? "Comparable product." : "Model/variant reference; ownership is fictional."} ${r.retrieval === "retailer-search-extract" ? "Search extract only; direct retrieval denied." : "Direct listing reviewed."} ${priceComparison(p.amountMinor, r)}`,
            ),
    sources:
      topic === "closing-windows"
        ? windows.slice(0, 12).flatMap(({ f }) =>
            f.sources.map((s) => ({
              id: f.id,
              title: s.label,
              label: f.provenance,
              href: s.href,
            })),
          )
        : [
            ...new Map(
              prices.map(({ reference: r }) => [
                r.id,
                {
                  id: r.id,
                  title: `${r.retailer} · ${r.model}`,
                  label: `Retail reference snapshot · ${r.checkedAt}`,
                  href: r.url,
                },
              ]),
            ).values(),
          ].slice(0, 12),
    actions: matching.slice(0, 4).map((p) => ({
      label: `Review ${p.name} · ${p.purchasedOn}`,
      href: p.href,
    })),
  };
}
