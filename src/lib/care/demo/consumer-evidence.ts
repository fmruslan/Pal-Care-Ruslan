import { createHash } from "node:crypto";
import { z } from "zod";
import type { DemoData } from "../../../db/schema";
import type { OwnershipFact, OwnershipView } from "../ownership-contracts";
import { findTwin, money } from "../../demo/presentation";

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const base = {
  version: z.literal(1),
  simulated: z.literal(true),
  asOf: z.literal("2026-11-05T12:00:00.000Z"),
  twinId: z.uuid(),
  documentId: z.uuid(),
};
const schema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("price-opportunity"),
    paidMinor: z.literal(14900),
    previousMinor: z.literal(14900),
    currentMinor: z.literal(12900),
    eligibility: z.literal("needs-review"),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("return-progress"),
    milestones: z.tuple([
      z.literal("Return agreed · November 1"),
      z.literal("Parcel received · November 4"),
      z.literal("Inspection pending"),
    ]),
    refundConfirmed: z.literal(false),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("refund-illustration"),
    amountMinor: z.literal(2495),
    completedOn: z.literal("2026-11-04"),
    providerVerified: z.literal(false),
  }),
]);
const common = {
  version: 1,
  simulated: true,
  asOf: "2026-11-05T12:00:00.000Z",
};
export const consumerDemoSources = [
  {
    ...common,
    kind: "price-opportunity",
    twinId: id(201),
    documentId: id(1201),
    paidMinor: 14900,
    previousMinor: 14900,
    currentMinor: 12900,
    eligibility: "needs-review",
  },
  {
    ...common,
    kind: "return-progress",
    twinId: id(206),
    documentId: id(1206),
    milestones: [
      "Return agreed · November 1",
      "Parcel received · November 4",
      "Inspection pending",
    ],
    refundConfirmed: false,
  },
  {
    ...common,
    kind: "refund-illustration",
    twinId: id(208),
    documentId: id(1208),
    amountMinor: 2495,
    completedOn: "2026-11-04",
    providerVerified: false,
  },
].map((value) => schema.parse(value));
const body = (value: unknown) =>
  "PAL CARE — DEMO CARE SCENARIO\nFictional evidence only. No real merchant action, shipment, refund or PayPal operation occurred. Original purchases and payment evidence are unchanged.\n" +
  JSON.stringify(value, null, 2);
export const consumerDemoDocuments = consumerDemoSources.map((source) => ({
  id: source.documentId,
  twinId: source.twinId,
  kind: "care-card",
  origin: "sample",
  title: `${source.kind === "price-opportunity" ? "Headphones price review" : source.kind === "return-progress" ? "Boots return progress" : "Book refund illustration"} · Demo source`,
  content: body(source),
}));
export function withConsumerDemoFixtures(data: DemoData): DemoData {
  return {
    ...data,
    consumerDemo: true,
    documents: [...data.documents, ...structuredClone(consumerDemoDocuments)],
  };
}

export function assertConsumerDemoDocuments(data: DemoData) {
  if (!data.consumerDemo || !data.demoCare)
    throw Error("consumer_demo_requires_saved_pack");
  for (const source of consumerDemoSources) {
    const purchase = findTwin(data, source.twinId);
    const expected = consumerDemoDocuments.find(
      (d) => d.id === source.documentId,
    )!;
    const doc = purchase?.documents.find((d) => d.id === source.documentId);
    if (
      !purchase ||
      purchase.twin.origin !== "sample" ||
      !doc ||
      doc.origin !== "sample" ||
      doc.kind !== "care-card" ||
      doc.content !== expected.content ||
      doc.title !== expected.title
    )
      throw Error("consumer_demo_source_missing_or_changed");
  }
}

/** Only exact saved sample documents can create these fictional outcomes. */
export function withConsumerDemoOwnership(
  view: OwnershipView,
  data: DemoData,
): OwnershipView {
  if (!data.consumerDemo) return view;
  if (!data.demoCare) throw Error("consumer_demo_requires_saved_pack");
  const source = consumerDemoSources.find((s) => s.twinId === view.twinId);
  if (!source) return view;
  const purchase = findTwin(data, view.twinId);
  const expected = consumerDemoDocuments.find(
    (d) => d.id === source.documentId,
  )!;
  const doc = purchase?.documents.find((d) => d.id === source.documentId);
  if (
    !purchase ||
    purchase.twin.origin !== "sample" ||
    !doc ||
    doc.origin !== "sample" ||
    doc.kind !== "care-card" ||
    doc.content !== expected.content ||
    doc.title !== expected.title
  )
    throw Error("consumer_demo_source_missing_or_changed");
  if (
    (source.kind === "price-opportunity" &&
      purchase.twin.purchasePriceMinor !== source.paidMinor) ||
    (source.kind === "refund-illustration" &&
      purchase.twin.purchasePriceMinor < source.amountMinor)
  )
    throw Error("consumer_demo_purchase_amount_mismatch");
  // Never obscure a real urgent fact or borrow sample status for Sandbox history.
  if (
    !view.simulation ||
    view.recordedFacts?.some((f) => f.state === "attention")
  )
    return view;
  const topic =
    source.kind === "price-opportunity"
      ? "price"
      : source.kind === "return-progress"
        ? "returns"
        : "refunds";
  if (
    view.facts.some(
      (f) =>
        f.topic === topic &&
        !f.simulation &&
        !["unknown", "unavailable", "not-applicable"].includes(f.state),
    )
  )
    return view;
  const consumer =
    source.kind === "price-opportunity"
      ? {
          status: "Price drop found",
          summary: `A ${money(source.paidMinor - source.currentMinor)} lower catalog price was found. Eligibility needs review.`,
          action: "Review opportunity",
          nextStep:
            "Compare the exact product, seller's price policy and deadline before requesting an adjustment. The lower catalog price is not eligibility or money saved.",
        }
      : source.kind === "return-progress"
        ? {
            status: "Return in progress",
            summary:
              "Your parcel has reached the seller. The next step is an inspection; no refund is confirmed.",
            action: "View return progress",
            nextStep:
              "Keep the return confirmation and parcel receipt. Wait for the inspection outcome before expecting a refund. This Demo has no live carrier or merchant connection.",
          }
        : {
            status: "Refund example",
            summary: `An illustrative ${money(source.amountMinor)} refund. No PayPal refund was issued.`,
            action: "View refund details",
            nextStep:
              "Review the Demo refund breakdown and original receipt. This illustration is excluded from verified refunds and money recovered.",
          };
  const fact: OwnershipFact = {
    id: `consumer-demo:${source.documentId}`,
    topic,
    consumer,
    summary: consumer.summary,
    title: consumer.status,
    status: `${consumer.status} · Demo`,
    detail: `${consumer.summary} ${consumer.nextStep} Demo scenario as of ${source.asOf}. ${source.kind === "return-progress" ? source.milestones.join(" → ") + "." : ""} No real financial, merchant or delivery operation occurred.`,
    provenance: "Demo · fictional saved scenario document",
    date: source.kind === "refund-illustration" ? source.completedOn : null,
    recordedAt: null,
    state: source.kind === "price-opportunity" ? "attention" : "recorded",
    verified: false,
    demoCompletion: source.kind === "refund-illustration" ? true : undefined,
    sources: [{ label: "Demo source document", href: `/documents/${doc.id}` }],
    action: {
      label: consumer.action,
      href: `/vault/${view.twinId}?milestone=${topic}`,
    },
    simulation: {
      packId: data.demoCare.id,
      scenarioId: `consumer:${source.documentId}`,
      asOf: source.asOf,
    },
  };
  return {
    ...view,
    facts: [fact, ...view.facts.filter((f) => f.topic !== topic)],
    history: [...view.history, fact],
    revision: createHash("sha256")
      .update(JSON.stringify([view.revision, fact, doc.content]))
      .digest("hex")
      .slice(0, 8),
    pill: {
      label: fact.status,
      topic,
      verified: false,
      attention: fact.state === "attention",
    },
  };
}
