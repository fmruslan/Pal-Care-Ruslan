import type { DemoData } from "../../db/schema";
import type { LibraryPurchase } from "../demo/library";
import { findTwin, money } from "../demo/presentation";
import type { CareItem } from "./model";
import type { SavedCare } from "./store";
import { evidenceLabel, returnTimeline, warrantyDeadline } from "./contracts";
import type { PurchaseActivity } from "../careos/activity";
import type { GuardianOverview } from "../price-guardian/contracts";
import { guardianRules, validatePolicy } from "../price-guardian/policy";
import type { ProtectionView } from "./protection/contracts";

import type {
  OwnershipFact,
  OwnershipTopic,
  OwnershipView,
} from "./ownership-contracts";
import { ownershipTopics } from "./ownership-contracts";
export {
  ownershipHref,
  ownershipTopic,
  ownershipTopics,
} from "./ownership-contracts";
export type {
  OwnershipFact,
  OwnershipTopic,
  OwnershipView,
} from "./ownership-contracts";

const topicOf = (kind: CareItem["kind"]): OwnershipTopic =>
  kind === "return"
    ? "returns"
    : kind === "refund"
      ? "refunds"
      : kind === "care"
        ? "purchase"
        : kind;

function contentRevision(value: unknown) {
  // Non-security fingerprint for presentation freshness, never authorization.
  let hash = 2166136261;
  for (const character of JSON.stringify(value))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

/** One server-owned aggregate: all findings (not filtered attention cards), plus
 * complete non-urgent dates and original history. Never infer an external event
 * from a sample reminder, a generic source string, a model or elapsed time. */
export function ownershipView(options: {
  purchase: LibraryPurchase;
  data: DemoData;
  saved: SavedCare;
  findings: CareItem[];
  asOf: string;
  unavailable: string[];
  complete: boolean;
  activity?: PurchaseActivity;
  guardian?: GuardianOverview | null;
  adjustmentIds?: string[];
  protection?: ProtectionView;
}): OwnershipView {
  const { purchase: p, data, saved, asOf } = options;
  const record = findTwin(data, p.id);
  if (!record) throw Error("ownership_not_found");
  const findings = options.findings.filter((f) => f.purchase.id === p.id);
  const missing = [...new Set(options.unavailable)];
  const careUnavailable = missing.includes("Care tracking") || !saved.complete;
  const base = (
    topic: OwnershipTopic,
    title: string,
    status: string,
    detail: string,
  ): OwnershipFact => ({
    id: `${p.id}:${topic}`,
    topic,
    title,
    status,
    detail,
    provenance: "Saved purchase records",
    date: null,
    recordedAt: null,
    state: "unknown",
    verified: false,
    sources: [],
  });
  const purchase: OwnershipFact = {
    ...base(
      "purchase",
      "Purchased",
      p.amountMinor === null ? "Reference ownership · Sample" : "Purchased",
      p.amountMinor === null
        ? "Reference sample ownership; no paid amount or payment is established."
        : `${money(p.amountMinor)} ${p.origin === "sandbox" ? "paid in PayPal Sandbox. Retrieved order/capture evidence establishes payment only; no real money." : "sample purchase amount, not a PayPal-verified payment."}`,
    ),
    provenance:
      p.origin === "sandbox"
        ? "Verified Sandbox payment"
        : "Sample purchase record",
    date: p.purchasedOn,
    recordedAt: record.twin.verifiedAt,
    verified: p.origin === "sandbox",
    state: "recorded",
    sources: p.documentLinks.map((d) => ({ label: d.title, href: d.href })),
    action: p.receiptHref
      ? { label: "View original receipt", href: p.receiptHref }
      : undefined,
  };
  const shipment = base(
    "shipment",
    "Shipment",
    "Not connected",
    "Fictional demo goods do not ship. No merchant tracking or carrier feed is connected. A tracking number alone would not confirm carrier movement.",
  );
  shipment.state = "not-applicable";
  const delivery = {
    ...base(
      "delivery",
      "Delivery",
      "Not connected",
      "No delivery event is recorded. Fictional goods do not ship; a completed payment is not delivery evidence.",
    ),
    state: "not-applicable" as const,
  };
  const priceWindow = base(
    "price-window",
    "Price-adjustment deadline",
    "Unknown",
    "No applicable price-adjustment deadline is established in these purchase records. The later demo-price-v2 promise is not retroactive; a catalog difference does not establish eligibility.",
  );
  const applicable =
    options.guardian?.cases.filter(
      (c) =>
        c.twinId === p.id &&
        options.adjustmentIds?.includes(c.id) &&
        validatePolicy(guardianRules, c.policyTerms, c.policyHash) &&
        Number.isFinite(Date.parse(c.expiresAt)),
    ) ?? [];
  if (
    applicable.length &&
    new Set(applicable.map((c) => c.expiresAt)).size === 1
  ) {
    const c = applicable[0];
    const remaining = Date.parse(c.expiresAt) - Date.parse(asOf);
    Object.assign(priceWindow, {
      status:
        remaining <= 0
          ? "Recorded adjustment window expired"
          : "Recorded adjustment window open",
      date: c.expiresAt,
      recordedAt: c.createdAt,
      state: remaining <= 0 ? "expired" : "upcoming",
      provenance: `${c.policyVersion} · recorded merchant policy`,
      detail: `Initial adjustment dispatch deadline ${c.expiresAt}, exclusive, under the purchase-bound 14 × 24-hour demo price promise. ${remaining > 0 ? `${Math.ceil(remaining / 3600000)} hours remaining (rounded up).` : "The initial dispatch window is closed."} Eligibility, approval and refund completion remain separate; expiry never triggers a payment.`,
      sources: [
        { label: "Recorded adjustment and policy", href: `/guardian/${c.id}` },
      ],
    });
  } else if (applicable.length) {
    priceWindow.status = "Conflicting recorded deadlines";
    priceWindow.state = "attention";
  }
  const protection = options.protection;
  if (protection?.policyVerified && protection.deadline)
    Object.assign(priceWindow, {
      status:
        protection.state === "expired"
          ? "Recorded adjustment window expired"
          : "Recorded adjustment window open",
      date: protection.deadline,
      state: protection.state === "expired" ? "expired" : "upcoming",
      detail: protection.detail,
      provenance: "Original applicable merchant policy",
      sources: protection.sources,
    });
  const returnWindow = base(
    "return-window",
    "Return deadline",
    "Unknown",
    "No confirmed return deadline or applicable structured return window is recorded. Do not assume a universal return period. An enquiry does not establish eligibility or merchant approval.",
  );
  returnWindow.action = {
    label: "Prepare an unsent return enquiry",
    href: `/care/${p.id}#returns`,
  };
  const warranty = base(
    "warranty",
    "Warranty expiration",
    "Unknown",
    "No verified warranty expiration dates are recorded. Fictional goods have no real warranty; a purchase date does not establish coverage.",
  );
  const warranties = saved.warranties
    .filter((w) => w.twinId === p.id)
    .flatMap((w) => {
      const valid = warrantyDeadline(w, asOf.slice(0, 10));
      return valid ? [valid] : [];
    });
  if (new Set(warranties.map((w) => `${w.expiresOn}:${w.basis}`)).size > 1) {
    warranty.status = "Conflicting recorded dates";
    warranty.state = "attention";
    warranty.detail =
      "Recorded warranty dates conflict. Review their sources; no date or coverage was selected arbitrarily.";
  } else if (warranties.length) {
    const w = warranties[0];
    Object.assign(warranty, {
      status: w.expired
        ? "Recorded date expired"
        : w.days === 0
          ? "Recorded date is today"
          : `Recorded date in ${w.days} days`,
      detail: `${w.expiresOn} · ${w.basis}. ${evidenceLabel(w.evidence)}; not a coverage guarantee. Calendar-day calculation uses UTC; no exact expiry hour is asserted.`,
      provenance: evidenceLabel(w.evidence),
      date: w.expiresOn,
      recordedAt: w.evidence.recordedAt,
      sources: [{ label: w.evidence.reference, href: w.evidence.href }],
      state: w.expired ? "expired" : "upcoming",
    });
  }
  if (careUnavailable)
    for (const fact of [warranty, returnWindow]) {
      fact.detail +=
        " Saved Care evidence is unavailable or incomplete; absence is not confirmed.";
      if (fact.state === "unknown") {
        fact.status = "Evidence unavailable";
        fact.state = "unavailable";
      }
    }
  const warrantyFinding = findings.find((f) => f.kind === "warranty");
  if (warrantyFinding && warranty.state !== "attention")
    warranty.status = warrantyFinding.status;
  const history: OwnershipFact[] = [purchase];
  const returnEvents = returnTimeline(p.id, saved.returns);
  for (const event of returnEvents)
    history.push({
      ...base(
        "returns",
        "Return progress",
        event.state === "prepared"
          ? "Return message prepared · not sent"
          : `Return ${event.state} · ${evidenceLabel(event.evidence).toLowerCase()}`,
        "Only this milestone is recorded. Missing intermediate steps stay missing. No refund is inferred; reported progress is not independently verified merchant or carrier evidence.",
      ),
      id: event.id,
      date: event.evidence.effectiveOn,
      recordedAt: event.evidence.recordedAt,
      provenance: evidenceLabel(event.evidence),
      state:
        event.evidence.effectiveOn > asOf.slice(0, 10)
          ? "upcoming"
          : "recorded",
      sources: [{ label: event.evidence.reference, href: event.evidence.href }],
      action: {
        label: "View recorded return details",
        href: `/care/${p.id}#returns`,
      },
    });
  const facts: OwnershipFact[] = [
    purchase,
    shipment,
    delivery,
    priceWindow,
    returnWindow,
    warranty,
  ];
  if (protection)
    facts.push({
      ...base("price", "Price protection", protection.label, protection.detail),
      state: ["opportunity", "ending"].includes(protection.state)
        ? "attention"
        : protection.state === "expired"
          ? "expired"
          : protection.state === "unavailable"
            ? "unknown"
            : "recorded",
      recordedAt: protection.lastCheckedAt,
      provenance:
        "Saved policy and supported source checks · fictional demo scope",
      sources: protection.sources,
      action: {
        label:
          protection.state === "opportunity"
            ? "Review adjustment evidence"
            : "Review protection details",
        href: `/care/${p.id}#price`,
      },
    });
  for (const finding of findings.filter(
    (f) => f.kind !== "care" && f.kind !== "warranty",
  )) {
    const fact: OwnershipFact = {
      id: finding.id,
      topic: topicOf(finding.kind),
      title:
        finding.kind === "watch"
          ? "Catalog watch"
          : finding.kind === "price"
            ? "Price protection"
            : finding.kind === "safety"
              ? "Safety assessment"
              : finding.kind === "return"
                ? "Return progress"
                : "Refund",
      status: finding.status,
      detail: finding.detail,
      provenance: finding.provenance,
      // A catalog read/check is an observation, not the unknown price-change time.
      date: ["price", "watch"].includes(finding.kind) ? null : finding.at,
      recordedAt: finding.at,
      state: finding.group === "action" ? "attention" : "recorded",
      verified: finding.verified,
      sources: finding.evidence,
      action: finding.action,
    };
    if (fact.topic !== "price" || !protection) facts.push(fact);
    if (fact.topic !== "returns" && fact.topic !== "price") history.push(fact);
  }
  // Paused/expired watches remain inspectable without being active Care cards.
  for (const watch of saved.watches.filter(
    (w) => w.twinId === p.id && !facts.some((f) => f.id === `watch:${w.id}`),
  )) {
    facts.push({
      ...base(
        "watch",
        "Catalog watch",
        `Recorded watch: ${Date.parse(watch.expiresAt) <= Date.parse(asOf) ? "expired" : watch.state}`,
        `Fixed fictional catalog only. Last successful check: ${watch.lastCheckedAt ?? "not recorded"}. Next due: ${watch.nextCheckAt ?? "not scheduled"}. Expires ${watch.expiresAt}. Last observed price: ${watch.observedMinor === null ? "not recorded" : money(watch.observedMinor)}. This is not proof of active monitoring. Private operator controls opt-in/pause; no public write action is available.`,
      ),
      id: `watch:${watch.id}`,
      recordedAt: watch.lastCheckedAt,
      provenance: "Recorded fictional merchant catalog",
      state:
        Date.parse(watch.expiresAt) <= Date.parse(asOf)
          ? "expired"
          : "recorded",
    });
  }
  const latestReturn = history
    .filter(
      (f) => f.topic === "returns" && f.date && f.date <= asOf.slice(0, 10),
    )
    .at(-1);
  if (!facts.some((f) => f.topic === "returns") && latestReturn)
    facts.push(latestReturn);
  if (!facts.some((f) => f.topic === "returns"))
    facts.push({
      ...base(
        "returns",
        "Return progress",
        "No recorded case",
        "No supported return progress is available in these loaded records. I can help prepare a return enquiry; nothing is submitted.",
      ),
      state: careUnavailable ? "unavailable" : "unknown",
      action: returnWindow.action,
    });
  if (!facts.some((f) => f.topic === "refunds"))
    facts.push({
      ...base(
        "refunds",
        "Refund",
        "No verified refund recorded",
        "Purchase payment evidence is not refund evidence. Missing or unavailable records do not establish that no refund exists.",
      ),
      state: missing.some((v) => v.startsWith("Price Guardian"))
        ? "unavailable"
        : "unknown",
    });
  const safety = base(
    "safety",
    "Safety assessment",
    "Not comprehensively checked",
    "Available recall coverage is limited to one reviewed historical official notice. No fresh comprehensive search or physical-product identity verification was performed. Missing evidence is not a safety all-clear.",
  );
  // Immutable original sample events remain history only, never current delivery,
  // return approval, deadlines, financial or safety evidence.
  for (const event of record.events.filter((e) => e.kind !== "purchase"))
    history.push({
      ...base("purchase", "Saved event", event.title, event.description),
      id: `purchase-event:${event.id}`,
      date: event.occurredOn,
      recordedAt: null,
      state: "recorded",
      provenance:
        event.origin === "sample"
          ? "Fictional sample event · not a current verified state"
          : "Saved purchase event · not external aftercare verification",
    });
  for (const item of options.activity?.items.filter(
    (item) =>
      item.twinId === p.id &&
      Number.isFinite(Date.parse(item.at)) &&
      !history.some((f) => f.id === item.id) &&
      (item.href === `/vault/${p.id}#history-heading` ||
        item.href === `/safety?twinId=${p.id}` ||
        p.documentLinks.some((d) => d.href === item.href) ||
        options.adjustmentIds?.some((id) => item.href === `/guardian/${id}`)),
  ) ?? []) {
    const fact: OwnershipFact = {
      ...base(
        item.kind === "recall"
          ? "safety"
          : item.kind === "refund"
            ? "refunds"
            : item.kind === "return"
              ? "returns"
              : "purchase",
        item.kind === "recall" ? "Saved safety assessment" : "Recorded event",
        item.title,
        item.detail,
      ),
      id: item.id,
      date: item.at,
      recordedAt: item.at,
      provenance: item.provenance,
      state: "recorded",
      sources: [{ label: "View original evidence", href: item.href }],
    };
    history.push(fact);
    if (item.kind === "recall" && !facts.some((f) => f.topic === "safety"))
      facts.push({
        ...fact,
        action: { label: "Review safety evidence", href: item.href },
      });
  }
  if (!facts.some((f) => f.topic === "safety"))
    facts.push({
      ...safety,
      state: missing.some((v) => v.startsWith("Recall Guardian"))
        ? "unavailable"
        : "unknown",
      action: {
        label: "Review official-source assessment",
        href: `/safety?twinId=${p.id}`,
      },
    });
  const relevant = findings
    .filter((f) => ["refund", "return", "safety"].includes(f.kind))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.at.localeCompare(a.at) ||
        a.id.localeCompare(b.id),
    )[0];
  const conflict = facts.find(
    (f) => f.state === "attention" && f.topic === "warranty",
  );
  const urgentDate = findings.find((f) => f.kind === "warranty");
  const pill = relevant
    ? {
        label: relevant.status,
        topic: topicOf(relevant.kind),
        verified: relevant.verified,
        attention: relevant.group === "action",
      }
    : conflict || urgentDate
      ? {
          label: "Needs attention",
          topic: "warranty" as const,
          verified: false,
          attention: true,
        }
      : protection &&
          [
            "watching",
            "ending",
            "opportunity",
            "requested",
            "confirmed",
            "policy-checking",
          ].includes(protection.state)
        ? {
            label: protection.label,
            topic: "price" as const,
            verified: protection.state === "confirmed",
            attention: ["opportunity", "ending"].includes(protection.state),
          }
        : {
            label: purchase.status,
            topic: "purchase" as const,
            verified: purchase.verified,
            attention: false,
          };
  const sorted = facts.sort(
    (a, b) =>
      (a.date === null && b.date === null
        ? ownershipTopics.indexOf(a.topic) - ownershipTopics.indexOf(b.topic)
        : a.date === null
          ? 1
          : b.date === null
            ? -1
            : a.date.localeCompare(b.date)) || a.id.localeCompare(b.id),
  );
  // Content revision, not a trusted client token. asOf is separate so time alone
  // does not falsely imply that a source changed on every page refresh.
  const revision = contentRevision([
    sorted.map((fact) =>
      fact.topic === "price" && fact.provenance.includes("read on this visit")
        ? { ...fact, recordedAt: null }
        : fact,
    ),
    history,
    missing,
    options.complete,
  ]);
  return {
    twinId: p.id,
    purchase: {
      name: p.name,
      model: p.model,
      purchasedOn: p.purchasedOn,
      origin: p.origin,
      receipt: p.receiptHref,
    },
    asOf,
    revision,
    facts: sorted,
    history: history.sort(
      (a, b) =>
        (a.date ?? "").localeCompare(b.date ?? "") || a.id.localeCompare(b.id),
    ),
    pill,
    unavailable: missing,
    complete: options.complete && saved.complete,
  };
}
