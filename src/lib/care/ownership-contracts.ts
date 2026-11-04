/** Browser-safe read/presentation contracts; no database/provider imports. */
export const ownershipTopics = [
  "purchase",
  "shipment",
  "delivery",
  "price",
  "price-window",
  "return-window",
  "returns",
  "refunds",
  "warranty",
  "safety",
  "watch",
] as const;
export type OwnershipTopic = (typeof ownershipTopics)[number];
export type OwnershipFact = {
  id: string;
  topic: OwnershipTopic;
  title: string;
  status: string;
  detail: string;
  provenance: string;
  date: string | null;
  recordedAt: string | null;
  state:
    | "recorded"
    | "upcoming"
    | "expired"
    | "unknown"
    | "unavailable"
    | "not-applicable"
    | "attention";
  verified: boolean;
  sources: { label: string; href: string }[];
  action?: { label: string; href: string };
};
export type OwnershipView = {
  twinId: string;
  purchase: {
    name: string;
    model: string;
    purchasedOn: string;
    origin: string;
    receipt: string | null;
  };
  asOf: string;
  revision: string;
  facts: OwnershipFact[];
  history: OwnershipFact[];
  pill: {
    label: string;
    topic: OwnershipTopic;
    verified: boolean;
    attention: boolean;
  };
  unavailable: string[];
  complete: boolean;
};
export function ownershipHref(twinId: string, topic: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      twinId,
    ) ||
    !ownershipTopics.includes(topic as OwnershipTopic)
  )
    throw Error("invalid_ownership_target");
  return `/vault/${twinId}?milestone=${topic}`;
}
export function ownershipTopic(value: unknown): OwnershipTopic | null {
  return typeof value === "string" &&
    ownershipTopics.includes(value as OwnershipTopic)
    ? (value as OwnershipTopic)
    : null;
}
