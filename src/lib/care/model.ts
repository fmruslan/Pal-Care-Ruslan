import type { DemoData } from "../../db/schema";
import { customerDataset } from "../intelligence/customer-model";
import { homeLibrary, type LibraryPurchase } from "../demo/library";
import { parseLibraryQuery } from "../library-navigation";
import { money } from "../demo/presentation";
import type { KnowledgeSource } from "../careos/knowledge";
import type { PurchaseActivity } from "../careos/activity";
import type { GuardianOverview } from "../price-guardian/contracts";
import type { SavedCare } from "./store";
import { evidenceLabel, returnTimeline, warrantyDeadline } from "./contracts";
import { ownershipHref, ownershipView } from "./ownership";
import {
  emptyProtection,
  protectionLabels,
  type SavedProtection,
  type ProtectionView,
} from "./protection/contracts";
import { protectionView, type ProtectionInput } from "./protection/model";
import { validatePolicy, guardianRules } from "../price-guardian/policy";
import { retailReferences, withDemoOwnership } from "./demo/model";
import { withConsumerDemoOwnership } from "./demo/consumer-evidence";
import { documentPresentation } from "../document-presentation";
import { findTwin } from "../demo/presentation";

export type CareItem = {
  topic?: import("./ownership-contracts").OwnershipTopic;
  id: string;
  purchase: LibraryPurchase;
  kind:
    | "price"
    | "refund"
    | "return"
    | "care"
    | "safety"
    | "warranty"
    | "watch"
    | "delivery";
  group: "action" | "tracking" | "completed";
  status: string;
  detail: string;
  summary?: string;
  provenance: string;
  at: string;
  verified: boolean;
  priority: number;
  action: { label: string; href: string };
  evidence: { label: string; href: string }[];
};

export function careDetailHref(twinId: string, topic = "overview") {
  return ["price", "returns", "refunds", "warranty"].includes(topic)
    ? ownershipHref(twinId, topic)
    : `/care/${twinId}`;
}

/** Pure projection. Loading Care does not dispatch AI, jobs or payment requests. */
export function careFeed(options: {
  data: DemoData & { source?: "fixtures" | "database" };
  knowledge: KnowledgeSource[];
  guardian: GuardianOverview | null;
  activity: PurchaseActivity;
  unavailable?: string[];
  now?: Date;
  savedCare?: SavedCare;
  persistenceEnabled?: boolean;
  scheduled?: boolean;
  protection?: {
    saved: SavedProtection;
    inputs: ProtectionInput[];
    scheduled: boolean;
  };
}) {
  const { data, knowledge, guardian, activity } = options;
  // Capture one evaluation clock for every present-tense ownership projection.
  // Scenario/source asOf timestamps remain immutable evidence snapshots.
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw Error("invalid_care_clock");
  const at = now.toISOString();
  const library = homeLibrary(data, parseLibraryQuery({}));
  const projection = customerDataset(
    data,
    knowledge,
    guardian,
    activity,
    options.unavailable ?? [],
    1000,
  );
  const purchases = library.allPurchases;
  const items: CareItem[] = [];
  const protections = purchases.map((p) => {
    const base = protectionView(
      p.id,
      options.protection?.saved ?? emptyProtection(),
      {
        now: new Date(at),
        scheduled: options.protection?.scheduled ?? false,
        input: options.protection?.inputs.find(
          (input) => input.twinId === p.id,
        ),
      },
    );
    const validated = projection.purchases.find((row) => row.id === p.id);
    const cases =
      guardian?.cases.filter(
        (c) =>
          c.twinId === p.id &&
          validated?.adjustmentIds.includes(c.id) &&
          validatePolicy(guardianRules, c.policyTerms, c.policyHash),
      ) ?? [];
    const record = cases[0];
    if (
      record &&
      cases.length === 1 &&
      Number.isFinite(Date.parse(record.expiresAt))
    ) {
      const adjustment = projection.adjustments.facts.find(
        (f) => f.id === record.id,
      );
      const state =
        adjustment?.stage === "Verified"
          ? "confirmed"
          : record.state === "pending" && record.attemptedAt
            ? "requested"
            : Date.parse(at) >= Date.parse(record.expiresAt)
              ? "expired"
              : "verified";
      return {
        ...base,
        state,
        label: protectionLabels[state],
        deadline: record.expiresAt,
        policyVerified: true,
        detail: `Original validated ${record.policyVersion} merchant policy. Recorded initial adjustment dispatch deadline ${record.expiresAt}, exclusive, under the purchase-bound 14 × 24-hour promise. Recorded merchant adjustment: ${record.state}. ${adjustment?.stage === "Verified" ? "Independent Sandbox refund evidence confirms the recorded adjustment, not a full purchase refund." : "This saved merchant workflow is not confirmed savings or permission to submit a request/refund."}`,
        sources: [
          ...base.sources,
          {
            label: "Original recorded adjustment and policy",
            href: `/guardian/${record.id}`,
          },
        ],
      } as ProtectionView;
    }
    return base;
  });
  for (const p of purchases) {
    const validated = projection.purchases.find((row) => row.id === p.id);
    if (!validated) continue;
    const evidence = p.documentLinks.map((d) => ({
      label: d.displayTitle ?? d.title,
      href: d.href,
    }));
    const base = { purchase: p, evidence, verified: false };
    const returns = returnTimeline(p.id, options.savedCare?.returns ?? []);
    for (const caseId of new Set(returns.map((r) => r.caseId))) {
      const last = returns
        .filter(
          (r) =>
            r.caseId === caseId && r.evidence.effectiveOn <= at.slice(0, 10),
        )
        .at(-1);
      if (!last) continue;
      if (["cancelled", "rejected"].includes(last.state)) continue;
      items.push({
        ...base,
        id: `return:${caseId}`,
        kind: "return",
        group:
          last.state === "closed"
            ? "completed"
            : last.state === "prepared"
              ? "action"
              : "tracking",
        status:
          last.state === "prepared"
            ? "Return message prepared · not sent"
            : `Return ${last.state} · ${evidenceLabel(last.evidence).toLowerCase()}`,
        detail:
          "Only recorded milestones are shown. No refund is inferred. Return progress does not establish a refund or merchant approval beyond its stated evidence.",
        provenance: evidenceLabel(last.evidence),
        at: last.evidence.recordedAt,
        priority: 2,
        action: {
          label: "View return progress",
          href: careDetailHref(p.id, "returns"),
        },
        evidence: [
          { label: last.evidence.reference, href: last.evidence.href },
        ],
      });
    }
    for (const value of options.savedCare?.warranties.filter(
      (r) => r.twinId === p.id,
    ) ?? []) {
      const warranty = warrantyDeadline(value, at.slice(0, 10));
      if (warranty?.approaching)
        items.push({
          ...base,
          id: `warranty:${p.id}`,
          kind: "warranty",
          group: "action",
          status: `Recorded warranty date ${warranty.days === 0 ? "is today" : `in ${warranty.days} days`} · ${evidenceLabel(warranty.evidence).toLowerCase()}`,
          detail: `${warranty.expiresOn} · ${warranty.basis}. This record does not establish real coverage for fictional goods.`,
          provenance: evidenceLabel(warranty.evidence),
          at: warranty.evidence.recordedAt,
          priority: 1,
          action: {
            label: "Review warranty record",
            href: careDetailHref(p.id, "warranty"),
          },
          evidence: [
            {
              label: warranty.evidence.reference,
              href: warranty.evidence.href,
            },
          ],
        });
    }
    for (const watch of options.savedCare?.watches.filter(
      (w) => w.twinId === p.id,
    ) ?? []) {
      if (
        watch.state === "paused" ||
        watch.state === "expired" ||
        Date.parse(watch.expiresAt) <= Date.parse(at)
      )
        continue;
      const fresh =
        watch.lastCheckedAt &&
        Date.parse(at) - Date.parse(watch.lastCheckedAt) >= 0 &&
        Date.parse(at) - Date.parse(watch.lastCheckedAt) <= 36 * 3600000;
      const active =
        options.scheduled &&
        watch.state === "active" &&
        fresh &&
        watch.nextCheckAt &&
        Date.parse(watch.nextCheckAt) > Date.parse(at) &&
        watch.observedMinor !== null &&
        Number.isSafeInteger(watch.observedMinor) &&
        watch.observedMinor > 0 &&
        watch.observedMinor <= 20000 &&
        data.twins.some(
          (t) => t.id === p.id && t.productId === guardianRules.productId,
        ) &&
        p.brand === guardianRules.brand &&
        p.model === guardianRules.model;
      items.push({
        ...base,
        id: `watch:${watch.id}`,
        kind: "watch",
        group: "tracking",
        status: active
          ? "Daily catalog watch · last check recorded"
          : watch.state === "error"
            ? "Catalog check needs review"
            : "Saved watch · monitoring not confirmed",
        detail: active
          ? `Last successful check ${watch.lastCheckedAt}: ${money(watch.observedMinor!)}. Next due ${watch.nextCheckAt}. Fixed fictional catalog only, not real-time market monitoring. A catalog observation is not a verified price-change event or adjustment eligibility.`
          : "An active schedule and a recent successful check are required before this watch can say it is monitoring. Watches can be paused by the private operator.",
        provenance:
          "Recorded fictional merchant catalog · no financial or model action",
        at: watch.lastCheckedAt ?? at,
        priority: 5,
        action: {
          label: "View watch details",
          href: careDetailHref(p.id, "price"),
        },
      });
    }
    const adjustments = projection.adjustments.facts.filter((f) =>
      validated.adjustmentIds.includes(f.id),
    );
    for (const fact of adjustments) {
      const completed = fact.stage === "Verified";
      if (fact.stage === "Closed") continue;
      const waiting = ["Proposed", "Approved", "Pending"].includes(fact.stage);
      items.push({
        ...base,
        id: `adjustment:${fact.id}`,
        kind: "refund",
        group: completed ? "completed" : waiting ? "tracking" : "action",
        status: completed
          ? "Partially refunded in Sandbox"
          : fact.stage === "Pending"
            ? "Refund pending"
            : fact.stage === "Proposed"
              ? "Awaiting merchant approval"
              : fact.stage === "Approved"
                ? "Approved · not submitted"
                : "Refund outcome needs review",
        detail: `${money(fact.amountMinor)} ${completed ? "independently verified. Original receipt unchanged; this is not a full purchase refund." : waiting ? "recorded adjustment. No completed refund is established; no action is needed from you." : "remains unresolved. A second refund must not be sent."}`,
        provenance: completed
          ? "Provider-verified Sandbox refund"
          : `${fact.policy} · recorded workflow, not savings`,
        at: fact.checkedAt,
        verified: completed,
        priority: 2,
        action: { label: "View refund details", href: fact.href! },
      });
    }
    const protection = protections.find((value) => value.twinId === p.id)!;
    if (
      !adjustments.length &&
      ["opportunity", "ending"].includes(protection.state)
    ) {
      items.push({
        ...base,
        id: `price:${p.id}`,
        kind: "price",
        group: "action",
        status: protection.label,
        detail: `${protection.differenceMinor !== null ? `${money(protection.differenceMinor)} potential adjustment, not confirmed savings. ` : ""}${protection.detail}`,
        provenance:
          "Recorded purchase-bound policy and fictional catalog evidence",
        evidence: protection.sources,
        at: protection.lastCheckedAt ?? at,
        priority: 3,
        action: {
          label:
            protection.state === "opportunity"
              ? "Review adjustment"
              : "Review closing window",
          href: careDetailHref(p.id, "price"),
        },
      });
    }
    // Existing sample return reminders are historical illustrations, not cases.
    // Only current source-backed safety assessments get attention cards.
    const safety = activity.items.filter(
      (item) =>
        item.twinId === p.id &&
        item.kind === "recall" &&
        item.attention &&
        validated.attention.includes(item.title),
    );
    for (const item of safety)
      items.push({
        ...base,
        id: item.id,
        kind: "safety",
        group: "action",
        status: "Review a saved safety assessment",
        detail: item.detail,
        provenance: item.provenance,
        at: item.at,
        priority: 0,
        action: {
          label: "Review safety evidence",
          href: `/safety?twinId=${p.id}`,
        },
      });
    // A specific recorded care finding is useful; a generic manual isn't urgent.
    if (
      validated.careStatus === "available" &&
      data.events.some(
        (event) => event.twinId === p.id && event.kind === "care",
      )
    )
      items.push({
        ...base,
        id: `care:${p.id}`,
        kind: "care",
        group: "tracking",
        status: "Source-backed product care",
        detail:
          "Explore the available exact-model official guidance and its documented topics and limits.",
        provenance: `${p.origin === "sample" ? "Sample ownership" : "Sandbox purchase"} · matched official documentation`,
        at: data.events.find(
          (event) => event.twinId === p.id && event.kind === "care",
        )!.occurredOn,
        priority: 4,
        action: { label: "Read care guidance", href: `/vault/${p.id}/care` },
      });
  }
  const unavailable = [
    ...new Set([...(options.unavailable ?? []), ...projection.unavailable]),
  ];
  const savedCare = options.savedCare ?? {
    returns: [],
    warranties: [],
    watches: [],
    complete: true,
  };
  const ownership = purchases.map((purchase) =>
    withConsumerDemoOwnership(
      withDemoOwnership(
        ownershipView({
          purchase,
          data,
          saved: savedCare,
          findings: items,
          asOf: at,
          unavailable,
          complete: library.complete,
          activity,
          guardian,
          adjustmentIds: projection.purchases.find((p) => p.id === purchase.id)
            ?.adjustmentIds,
          protection: protections.find((value) => value.twinId === purchase.id),
        }),
        data,
      ),
      data,
    ),
  );
  for (const view of ownership) {
    const record = findTwin(data, view.twinId);
    if (record)
      for (const f of [...view.facts, ...view.history]) {
        if (!f.simulation) continue;
        const doc = record.documents.find((d) =>
          f.sources.some((s) => s.href === `/documents/${d.id}`),
        );
        if (doc) {
          const presentation = documentPresentation(doc, record, view.asOf);
          if (presentation.recognized) f.presentation = presentation;
        }
      }
    const fact = view.facts.find((f) => f.simulation);
    const purchase = purchases.find((p) => p.id === view.twinId);
    if (!fact || !purchase) continue;
    items.push({
      id: fact.id,
      topic: fact.topic,
      purchase,
      kind:
        fact.topic === "return-window"
          ? "return"
          : fact.topic === "warranty"
            ? "warranty"
            : fact.topic === "delivery"
              ? "delivery"
              : fact.topic === "safety"
                ? "safety"
                : fact.topic === "returns"
                  ? "return"
                  : fact.topic === "refunds"
                    ? "refund"
                    : "price",
      // A saved illustration of completion is not a completed customer action.
      group: fact.state === "attention" ? "action" : "tracking",
      status: fact.status,
      detail: fact.detail,
      provenance: fact.provenance,
      at: fact.simulation!.asOf,
      verified: false,
      priority:
        fact.topic === "safety" ? 0 : fact.topic === "return-window" ? 1 : 3,
      action: fact.action!,
      evidence: fact.sources,
    });
  }
  return {
    retailReferences: retailReferences(data, new Date(at)),
    demoAsOf: data.demoCare?.asOf ?? null,
    ownership,
    protections,
    savedCare: options.savedCare ?? {
      returns: [],
      warranties: [],
      watches: [],
      complete: true,
    },
    purchases,
    items: items.sort(
      (a, b) =>
        a.priority - b.priority ||
        b.at.localeCompare(a.at) ||
        a.id.localeCompare(b.id),
    ),
    unavailable,
    complete: library.complete && (options.savedCare?.complete ?? true),
    source: data.source ?? "fixtures",
    searchIndex: library.searchIndex,
    observedAt: at,
    tracking: {
      returns: options.persistenceEnabled
        ? "Return progress uses recorded evidence only; manually reported milestones are not externally verified."
        : "No structured return tracking is connected.",
      warranties: options.persistenceEnabled
        ? "Warranty dates show their explicit source and basis; manual dates are not verified coverage."
        : "No verified warranty deadlines are recorded.",
      watches: options.scheduled
        ? "Supported daily checks cover only the fixed fictional merchant catalog; each watch shows its actual check state."
        : "Continuous price monitoring is not active.",
    },
  };
}
export type CareFeed = ReturnType<typeof careFeed>;
