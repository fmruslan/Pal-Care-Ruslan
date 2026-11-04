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
/** One compact product card, retaining every finding in the source disclosure. */
export function careProductCards(feed: CareFeed, completed: boolean) {
  const groups = completed ? ["completed"] : ["action", "tracking"];
  const products = new Map<
    string,
    { item: CareItem; findings: CareItem[]; view: OwnershipView | null }
  >();
  for (const item of feed.items.filter((item) => groups.includes(item.group))) {
    const existing = products.get(item.purchase.id);
    if (existing) existing.findings.push(item);
    else
      products.set(item.purchase.id, {
        item,
        findings: [item],
        view: feed.ownership.find((v) => v.twinId === item.purchase.id) ?? null,
      });
  }
  return [...products.values()];
}
