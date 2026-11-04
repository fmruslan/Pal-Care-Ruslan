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

export type CareItem = {
  id: string;
  purchase: LibraryPurchase;
  kind:
    "price" | "refund" | "return" | "care" | "safety" | "warranty" | "watch";
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
}) {
  const { data, knowledge, guardian, activity } = options;
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
  const at = (options.now ?? new Date()).toISOString();
  for (const p of purchases) {
    const validated = projection.purchases.find((row) => row.id === p.id);
    if (!validated) continue;
    const evidence = p.documentLinks.map((d) => ({
      label: d.title,
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
        watch.observedMinor !== null;
      items.push({
        ...base,
        id: `watch:${watch.id}`,
        kind: "watch",
        group: active ? "tracking" : "action",
        status: active
          ? "Daily catalog watch · last check recorded"
          : watch.state === "error"
            ? "Catalog check needs review"
            : "Saved watch · monitoring not confirmed",
        detail: active
          ? `Last successful check ${watch.lastCheckedAt}. Next due ${watch.nextCheckAt}. Fixed fictional catalog only, not real-time market monitoring.`
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
    // No prices from unrelated retailers, placeholder reference amounts or AI.
    const twin = data.twins.find((t) => t.id === p.id)!;
    const product = data.products.find(
      (item) =>
        item.id === twin.productId && item.merchantId === twin.merchantId,
    );
    const sameIdentity =
      product && product.model === p.model && product.brand === p.brand;
    const watched = options.savedCare?.watches.find(
      (w) =>
        w.twinId === p.id &&
        w.state === "active" &&
        w.observedMinor !== null &&
        Number.isSafeInteger(w.observedMinor) &&
        w.observedMinor > 0 &&
        w.lastCheckedAt &&
        Date.parse(w.lastCheckedAt) <= Date.parse(at) &&
        Date.parse(at) - Date.parse(w.lastCheckedAt) <= 36 * 3600000 &&
        Date.parse(w.expiresAt) > Date.parse(at),
    );
    const comparedMinor = watched?.observedMinor ?? product?.priceMinor;
    if (
      !adjustments.length &&
      sameIdentity &&
      p.amountMinor !== null &&
      product.currency === "USD" &&
      comparedMinor !== undefined &&
      Number.isSafeInteger(comparedMinor) &&
      comparedMinor > 0 &&
      comparedMinor < p.amountMinor
    ) {
      items.push({
        ...base,
        id: `price:${p.id}`,
        kind: "price",
        group: "action",
        status: watched
          ? "A lower catalog price was recorded"
          : "A lower catalog price is available",
        detail: `${money(p.amountMinor)} ${p.origin === "sample" ? "sample purchase" : "paid in Sandbox"} → ${money(comparedMinor)} ${watched ? "recorded" : "current"} fictional catalog. ${money(p.amountMinor - comparedMinor)} difference, not confirmed savings or refund eligibility.`,
        summary: `${money(p.amountMinor)} → ${money(comparedMinor)} · ${money(p.amountMinor - comparedMinor)} difference, not confirmed savings.`,
        provenance: watched
          ? `Recorded fictional catalog · checked ${watched.lastCheckedAt} · not real-time market monitoring`
          : "Fictional merchant catalog · read on this visit · not continuous monitoring",
        at: watched?.lastCheckedAt ?? at,
        priority: 3,
        action: {
          label: "Compare prices",
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
        group: "action",
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
    }),
  );
  return {
    ownership,
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
