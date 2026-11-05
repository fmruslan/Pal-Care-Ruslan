import type { CareFeed, CareItem } from "./model";
import type {
  OwnershipFact,
  OwnershipTopic,
  OwnershipView,
} from "./ownership-contracts";

export const careMilestoneTopics: OwnershipTopic[] = [
  "purchase",
  "delivery",
  "price-window",
  "return-window",
  "warranty",
];
export function careItemTopic(item: CareItem): OwnershipTopic {
  if (item.topic) return item.topic;
  return item.kind === "return"
    ? "returns"
    : item.kind === "refund"
      ? "refunds"
      : item.kind === "care"
        ? "purchase"
        : item.kind;
}
/** Presentation selection only. Dates/statuses come unchanged from ownershipView. */
export function careMilestones(
  view: OwnershipView,
  focus?: OwnershipTopic | null,
) {
  if (view.simulation) {
    const selected = new Set<OwnershipTopic>([
      "purchase",
      "price",
      ...(view.pill.topic === "returns" ? [] : ["return-window" as const]),
      "warranty",
      view.pill.topic,
      ...(focus ? [focus] : []),
    ]);
    const order: OwnershipTopic[] = [
      "purchase",
      "delivery",
      "price",
      "price-window",
      "return-window",
      "returns",
      "refunds",
      "warranty",
      "safety",
      "watch",
      "shipment",
    ];
    return order.flatMap((topic) => {
      const fact = selected.has(topic)
        ? view.facts.find((f) => f.topic === topic)
        : undefined;
      return fact ? [fact] : [];
    });
  }
  const topics = new Set(careMilestoneTopics);
  topics.add(view.pill.topic);
  for (const fact of view.facts) {
    if (
      ["shipment", "returns", "refunds", "safety", "watch"].includes(
        fact.topic,
      ) &&
      ["recorded", "upcoming", "attention"].includes(fact.state)
    )
      topics.add(fact.topic);
  }
  if (focus) topics.add(focus);
  return view.facts
    .filter((f) => topics.has(f.topic))
    .filter(
      (f, i, rows) => rows.findIndex((other) => other.topic === f.topic) === i,
    );
}
export function careMilestoneLabel(fact: OwnershipFact) {
  return {
    purchase: "Purchased",
    delivery: "Delivery",
    "price-window": "Price window",
    "return-window": "Return window",
    warranty: "Warranty",
    returns: "Return",
    refunds: "Refund",
    price: "Price",
    safety: "Safety",
    watch: "Watch",
    shipment: "Shipment",
  }[fact.topic];
}
export function careMilestoneState(fact: OwnershipFact) {
  return fact.state === "recorded"
    ? fact.verified
      ? "Verified"
      : "Recorded"
    : fact.state === "upcoming"
      ? "Upcoming"
      : fact.state === "expired"
        ? "Expired"
        : fact.state === "attention"
          ? "Review"
          : fact.state === "unavailable"
            ? "Unavailable"
            : fact.state === "not-applicable"
              ? "Not applicable"
              : "Unknown";
}
export function careNextWindow(view: OwnershipView) {
  return (
    view.facts
      .filter(
        (f) =>
          ["price-window", "return-window", "warranty"].includes(f.topic) &&
          f.state === "upcoming" &&
          f.date,
      )
      .sort(
        (a, b) => a.date!.localeCompare(b.date!) || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export type CareFilter =
  "all" | "attention" | "watching" | "protected" | "completed";
export function parseCareFilter(value: unknown): CareFilter {
  return ["attention", "watching", "protected", "completed"].includes(
    String(value),
  )
    ? (value as CareFilter)
    : "all";
}
/** All saved identities once; completed means a resolved action, not ownership. */
function purchaseCards(feed: CareFeed, filter: CareFilter | boolean = "all") {
  const selected =
    typeof filter === "boolean" ? (filter ? "completed" : "all") : filter;
  const rank = { action: 0, tracking: 1, completed: 2 };
  return feed.purchases
    .flatMap((purchase) => {
      const view = feed.ownership.find((v) => v.twinId === purchase.id) ?? null;
      const protection = feed.protections.find(
        (v) => v.twinId === purchase.id,
      )!;
      const findings = feed.items.filter(
        (item) =>
          item.purchase.id === purchase.id &&
          (selected !== "completed" || item.group === "completed"),
      );
      const actionable = findings.some((item) => item.group === "action");
      const resolved = findings.some((item) => item.group === "completed");
      const ongoing =
        protection.monitoring ||
        findings.some(
          (item) =>
            item.group === "tracking" &&
            ["return", "refund", "watch"].includes(item.kind),
        );
      if (
        (selected === "attention" && !actionable) ||
        (selected === "watching" && !protection.monitoring) ||
        (selected === "completed" && !findings.length)
      )
        return [];
      const primaryFindings =
        !actionable && resolved && !ongoing
          ? findings.filter((item) => item.group === "completed")
          : findings;
      const primary = [...primaryFindings].sort(
        (a, b) =>
          rank[a.group] - rank[b.group] ||
          a.priority - b.priority ||
          a.id.localeCompare(b.id),
      )[0];
      const item: CareItem = primary ?? {
        id: `ownership:${purchase.id}`,
        purchase,
        kind: "care",
        group: "tracking",
        status: protection.label,
        detail: protection.detail,
        provenance:
          purchase.origin === "sandbox"
            ? "Verified Sandbox purchase · protection is separate"
            : "Sample ownership · not real coverage",
        at: purchase.purchasedOn,
        verified: false,
        priority: 9,
        action: { label: "View purchase", href: purchase.href },
        evidence: purchase.documentLinks.map((d) => ({
          label: d.title,
          href: d.href,
        })),
      };
      return [
        {
          item,
          findings,
          view,
          protection,
          group: actionable
            ? ("action" as const)
            : selected === "completed" || (resolved && !ongoing)
              ? ("completed" as const)
              : ("tracking" as const),
          quiet: !actionable && !protection.monitoring,
        },
      ];
    })
    .sort(
      (a, b) =>
        rank[a.group] - rank[b.group] ||
        a.item.priority - b.item.priority ||
        b.item.purchase.purchasedOn.localeCompare(
          a.item.purchase.purchasedOn,
        ) ||
        a.item.purchase.id.localeCompare(b.item.purchase.id),
    );
}

/** Product presentation grouping never merges dated financial/coverage facts. */
export function careProductCards(
  feed: CareFeed,
  filter: CareFilter | boolean = "all",
) {
  const selected =
    typeof filter === "boolean" ? (filter ? "completed" : "all") : filter;
  if (!feed.demoAsOf && selected !== "protected") {
    return purchaseCards(feed, selected).map((card) => ({
      ...card,
      members: [card.item.purchase],
    }));
  }
  const all = purchaseCards(feed, "all").map((card) => {
    const fact = card.view?.facts.find((f) => f.simulation);
    const actualAction = card.group === "action";
    return {
      ...card,
      item:
        fact && !actualAction
          ? {
              ...card.item,
              status: fact.status,
              detail: fact.detail,
              group: fact.demoCompletion
                ? ("completed" as const)
                : fact.state === "attention"
                  ? ("action" as const)
                  : ("tracking" as const),
              action: fact.action!,
              evidence: fact.sources,
            }
          : card.item,
      group: fact?.state === "attention" ? ("action" as const) : card.group,
    };
  });
  const matches = (card: (typeof all)[number]) =>
    selected === "all" ||
    (selected === "attention" && card.group === "action") ||
    (selected === "completed" && card.group === "completed") ||
    (selected === "watching" &&
      (card.protection.monitoring ||
        (!!card.view?.simulation &&
          card.view.pill.label === "Monitoring · simulated"))) ||
    (selected === "protected" &&
      ((card.protection.policyVerified &&
        !!card.protection.deadline &&
        Date.parse(card.protection.deadline) > Date.parse(feed.observedAt)) ||
        card.view?.facts.some(
          (f) =>
            f.topic === "warranty" && f.simulation && f.state === "recorded",
        )));
  const groups = new Map<string, typeof all>();
  for (const card of all) {
    const p = card.item.purchase;
    const product = feed.purchases.find((row) => row.id === p.id)!;
    // Group only within the enabled curated demo, by exact brand/model/category.
    // Distinct snapshotted variants remain separate even if names look similar.
    const key =
      feed.demoAsOf && product.productId
        ? JSON.stringify([
            product.productId,
            product.brand,
            p.model,
            p.category,
            p.name,
          ])
        : p.id;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()]
    .flatMap((members) => {
      const matching = members.filter(matches);
      if (!matching.length) return [];
      const card = [...matching].sort(
        (a, b) =>
          Number(b.group === "action") - Number(a.group === "action") ||
          Number(!!b.view?.simulation) - Number(!!a.view?.simulation) ||
          a.item.purchase.id.localeCompare(b.item.purchase.id),
      )[0];
      return [{ ...card, members: members.map((m) => m.item.purchase) }];
    })
    .sort(
      (a, b) =>
        Number(b.group === "action") - Number(a.group === "action") ||
        a.item.priority - b.item.priority ||
        a.item.purchase.id.localeCompare(b.item.purchase.id),
    );
}
