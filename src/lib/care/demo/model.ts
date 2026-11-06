import type { DemoData } from "../../../db/schema";
import { findTwin, money } from "../../demo/presentation";
import type { OwnershipFact, OwnershipView } from "../ownership-contracts";
import { evidenceHash } from "../protection/model";
import { referenceSource as officialRecallExample } from "../../safety/reference";
import { consumerScenario } from "./consumer";
import {
  demoPackSchema,
  demoScenarioSchema,
  retailReferenceSchema,
  type DemoCarePack,
  type RetailReference,
} from "./contracts";

/** Strict pack validation is independent of UI, model output and source prose. */
export function validateDemoPack(value: DemoCarePack): DemoCarePack {
  const { id, version, asOf } = demoPackSchema.parse({
    id: value.id,
    version: value.version,
    asOf: value.asOf,
  });
  const references = value.references.map((r) =>
    retailReferenceSchema.parse(r),
  );
  const scenarios = value.scenarios.map((s) => demoScenarioSchema.parse(s));
  if (
    references.length > 100 ||
    scenarios.length > 100 ||
    new Set(references.map((r) => r.productId)).size !== references.length ||
    new Set([...references, ...scenarios].map((r) => r.id)).size !==
      references.length + scenarios.length ||
    new Set(scenarios.map((s) => s.twinId)).size !== scenarios.length
  )
    throw Error("conflicting_demo_evidence");
  for (const s of scenarios) {
    if ("startsAt" in s && Date.parse(s.startsAt) >= Date.parse(s.endsAt))
      throw Error("invalid_demo_window");
    if (
      s.kind === "price" &&
      (s.observations[0].variant !== s.observations[1].variant ||
        Date.parse(s.observations[0].at) >= Date.parse(s.observations[1].at) ||
        Date.parse(s.observations[1].at) > Date.parse(asOf) ||
        Date.parse(s.observations[0].at) < Date.parse(s.startsAt))
    )
      throw Error("invalid_demo_observations");
    if (
      s.kind === "delivery" &&
      (s.updates.some(
        (u, i) =>
          Date.parse(u.at) > Date.parse(asOf) ||
          (i > 0 && Date.parse(u.at) <= Date.parse(s.updates[i - 1].at)),
      ) ||
        Date.parse(s.estimatedAt) <= Date.parse(s.updates.at(-1)!.at))
    )
      throw Error("invalid_demo_delivery");
  }
  return { id, version, asOf, references, scenarios };
}

export function retailReferences(data: DemoData, now = new Date()) {
  if (!data.demoCare) return [];
  const pack = validateDemoPack(data.demoCare);
  return pack.references.filter(
    (r) =>
      Date.parse(r.checkedAt) <= now.getTime() &&
      data.products.some((p) => p.id === r.productId),
  );
}

export function priceComparison(
  amountMinor: number | null,
  reference: RetailReference,
) {
  if (amountMinor === null)
    return "Purchase amount unavailable; no difference was calculated.";
  const difference = amountMinor - reference.priceMinor;
  return difference > 0
    ? `Recorded retail reference is ${money(difference)} lower than the saved purchase amount${reference.match === "comparable" ? " for a comparable product, not an identical item" : ""}. Not a historical price-drop event, eligibility or savings.`
    : "Recorded retail reference is not lower than the saved purchase amount. This is not a live price or an eligibility decision.";
}

/** Simulation is presentation evidence, never trusted payment/Guardian input. */
export function withDemoOwnership(
  view: OwnershipView,
  data: DemoData,
): OwnershipView {
  if (!data.demoCare) return view;
  const pack = validateDemoPack(data.demoCare);
  const s = pack.scenarios.find((row) => row.twinId === view.twinId);
  if (!s) return view;
  const record = findTwin(data, view.twinId);
  const doc = record?.documents.find(
    (d) =>
      d.id === s.documentId && d.origin === "sample" && d.kind === "care-card",
  );
  // A hypothetical example never attaches to a verified payment or other Twin.
  if (
    !record ||
    record.twin.origin !== "sample" ||
    record.product.id !== s.productId ||
    !doc
  )
    throw Error("demo_purchase_binding_invalid");
  // Demonstrations must never hide a real/report-backed urgent finding.
  if (view.pill.attention) return view;
  const active =
    "startsAt" in s &&
    Date.parse(pack.asOf) >= Date.parse(s.startsAt) &&
    Date.parse(pack.asOf) < Date.parse(s.endsAt);
  const ending =
    active &&
    "endsAt" in s &&
    Date.parse(s.endsAt) - Date.parse(pack.asOf) <= 7 * 86400000;
  const topic =
    s.kind === "gap"
      ? "price"
      : s.kind === "return-window"
        ? "return-window"
        : s.kind === "warranty"
          ? "warranty"
          : s.kind === "safety"
            ? "safety"
            : s.kind === "delivery"
              ? "delivery"
              : "price";
  const existing = view.facts.find((f) => f.topic === topic);
  if (
    existing &&
    !["unknown", "unavailable", "not-applicable"].includes(existing.state)
  )
    return view;
  const drop =
    s.kind === "price" &&
    s.observations[1].priceMinor < s.observations[0].priceMinor;
  const attention =
    (s.kind === "return-window" && ending) ||
    s.kind === "safety" ||
    (s.kind === "price" && active && drop);
  const label =
    s.kind === "warranty"
      ? active
        ? `${s.extended ? "Extended warranty" : "Protected"} · simulated`
        : "Warranty expired · simulated"
      : s.kind === "return-window"
        ? `${active ? (ending ? "Return ending" : "Return window") : "Return expired"} · simulated`
        : s.kind === "delivery"
          ? "In transit · simulated"
          : s.kind === "safety"
            ? "Simulated notice"
            : s.kind === "gap"
              ? "Protection not verified"
              : !active
                ? "Price window expired · simulated"
                : drop
                  ? "Price drop · simulated"
                  : "Monitoring · simulated";
  const detail =
    s.kind === "delivery"
      ? `Fictional delivery sequence: ${s.updates.map((u) => `${u.at}: ${u.status}`).join("; ")}. Estimated arrival ${s.estimatedAt}, not a promise or confirmed carrier movement. No goods actually ship.`
      : s.kind === "price"
        ? `${s.terms} Simulated catalog: ${s.observations.map((o) => `${money(o.priceMinor)} on ${o.at}`).join(" → ")}. Hypothetical purchase basis ${money(s.hypotheticalPurchaseMinor)}; ${drop ? `${money(Math.max(0, s.hypotheticalPurchaseMinor - s.observations[1].priceMinor))} illustrative difference, not savings.` : "No simulated catalog drop."} Independent real retail references are separate. Example cutoff ${s.endsAt}, exclusive.`
        : s.kind === "return-window"
          ? `${s.terms} Example cutoff ${s.endsAt}, exclusive. ${active ? `${Math.ceil((Date.parse(s.endsAt) - Date.parse(pack.asOf)) / 86400000)} demo days remaining.` : "Example window closed."} Item condition: ${s.condition}. Nothing was requested or sent.`
          : s.kind === "warranty"
            ? `${s.terms} Example expiration ${s.endsAt}, exclusive.`
            : s.terms;
  const fact: OwnershipFact = {
    consumer: consumerScenario(s, active),
    summary:
      s.kind === "safety"
        ? "No official recall match established. Review exact identifiers."
        : s.kind === "gap"
          ? "No applicable protection policy is saved."
          : s.kind === "delivery"
            ? `Fictional dispatch recorded; estimated arrival ${s.estimatedAt.slice(0, 10)}.`
            : s.kind === "warranty"
              ? `Example term ends ${s.endsAt.slice(0, 10)}; exclusions apply.`
              : s.kind === "return-window"
                ? `Example closes ${s.endsAt.slice(0, 10)}; condition ${s.condition}.`
                : drop
                  ? "Two simulated catalog checks show a drop; review example terms."
                  : "Saved simulated price checks; no external tracker is connected.",
    id: s.id,
    topic,
    title:
      s.kind === "safety"
        ? "Simulated safety investigation"
        : "Simulated Care example",
    status: label,
    detail: `${detail} Simulated examples as of ${pack.asOf}; actual purchase/coverage status is unchanged.`,
    provenance: "Fictional demonstration · not external verification",
    date:
      "endsAt" in s ? s.endsAt : s.kind === "delivery" ? s.estimatedAt : null,
    recordedAt: null,
    verified: false,
    state: attention
      ? "attention"
      : s.kind === "gap"
        ? "unknown"
        : "endsAt" in s && !active
          ? "expired"
          : "recorded",
    sources: [
      { label: "Simulated example evidence", href: `/documents/${doc.id}` },
      ...(s.kind === "safety"
        ? [
            {
              label: "Official CPSC lookup · not searched this turn",
              href: "https://www.cpsc.gov/Recalls",
            },
            {
              label:
                "Reviewed historical Insignia notice · not a speaker match",
              href: officialRecallExample.URL,
            },
          ]
        : []),
    ],
    action: {
      label: "Review simulated evidence",
      href: `/vault/${view.twinId}?milestone=${topic}`,
    },
    simulation: { packId: pack.id, scenarioId: s.id, asOf: pack.asOf },
  };
  // Preserve actual facts separately; simulated rows can never mark verified=true.
  const facts = [...view.facts.filter((f) => f.topic !== topic), fact];
  return {
    ...view,
    recordedFacts: view.facts,
    facts,
    simulation: fact.simulation,
    revision: evidenceHash([view.revision, pack, fact]).slice(0, 8),
    pill: { label, topic, verified: false, attention },
  };
}
