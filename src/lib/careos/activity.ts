import type { DemoData } from "../../db/schema";
import type { GuardianView } from "../price-guardian/contracts";
import { money } from "../demo/presentation";

export type RecallActivity = {
  id: string;
  twinId: string;
  state: string;
  reason: string;
  at: string;
  hash: string;
};
export type PurchaseActivityItem = {
  id: string;
  twinId: string;
  kind:
    "purchase" | "document" | "care" | "price" | "refund" | "recall" | "return";
  at: string;
  title: string;
  detail: string;
  provenance: string;
  verified: boolean;
  attention: boolean;
  href: string;
};
export type PurchaseActivity = {
  items: PurchaseActivityItem[];
  unavailable: string[];
};

/** A projection only: ledgers stay authoritative, no source text acquires permissions. */
export function projectActivity(
  data: DemoData,
  guardian: GuardianView[] = [],
  recalls: RecallActivity[] = [],
  unavailable: string[] = [],
): PurchaseActivity {
  const twins = new Map(
    data.twins
      .filter(
        (t) =>
          t.customerId === data.customer.id &&
          t.merchantId === data.merchant.id,
      )
      .map((t) => [t.id, t]),
  );
  const items: PurchaseActivityItem[] = [];
  for (const e of data.events) {
    if (!twins.has(e.twinId)) continue;
    items.push({
      id: `purchase-event:${e.id}`,
      twinId: e.twinId,
      kind:
        e.kind === "purchase"
          ? "purchase"
          : e.kind === "price"
            ? "price"
            : e.kind === "return"
              ? "return"
              : "care",
      at: e.occurredOn,
      title: e.title,
      detail: e.description,
      provenance:
        e.origin === "sandbox"
          ? "Verified Sandbox purchase event"
          : "Fictional sample event",
      verified: e.origin === "sandbox",
      attention: false,
      href: `/vault/${e.twinId}#history-heading`,
    });
  }
  for (const d of data.documents.filter((d) => d.kind === "receipt")) {
    const t = twins.get(d.twinId);
    if (!t) continue;
    items.push({
      id: `document:${d.id}`,
      twinId: t.id,
      kind: "document",
      at: t.verifiedAt ?? t.purchasedOn,
      title: "Saved receipt",
      detail: `${d.title}. Document date uses the purchase record; no separate upload time is asserted.`,
      provenance:
        d.origin === "sandbox"
          ? "Verified Sandbox receipt"
          : "Fictional sample document",
      verified: d.origin === "sandbox" && t.origin === "sandbox",
      attention: false,
      href: `/documents/${d.id}`,
    });
  }
  for (const c of guardian) {
    if (!twins.has(c.twinId)) continue;
    const verified =
      c.state === "completed" &&
      !!c.refundId &&
      c.providerStatus === "COMPLETED" &&
      !!c.verifiedAt;
    const title = verified
      ? `${money(c.amountMinor)} refunded in PayPal Sandbox`
      : `${money(c.amountMinor)} merchant price adjustment · ${c.state.replaceAll("_", " ")}`;
    items.push({
      id: `guardian-state:${c.id}:${c.revision}:${c.state}`,
      twinId: c.twinId,
      kind: "refund",
      at: c.updatedAt,
      title,
      detail: verified
        ? "Independently verified refund. Original receipt unchanged."
        : "Recorded workflow, not verified savings. Merchant approval and independent provider evidence remain distinct.",
      provenance: verified
        ? "Provider-verified Sandbox refund"
        : `${c.priceOrigin === "controlled_demo" ? "Controlled demo price" : "Merchant observation"} · ${c.policyVersion}`,
      verified,
      attention: !["failed", "cancelled", "expired"].includes(c.state),
      href: `/guardian/${c.id}`,
    });
    for (const e of c.history)
      items.push({
        id: `guardian-event:${e.id}`,
        twinId: c.twinId,
        kind: e.kind.startsWith("refund.") ? "refund" : "price",
        at: e.at,
        title:
          e.kind === "refund.completed" && !verified
            ? "Refund completion requires independent review"
            : e.kind.replaceAll(".", " · "),
        detail: e.detail,
        provenance:
          e.kind === "refund.completed" && verified
            ? "Provider-verified Sandbox refund"
            : "Recorded merchant workflow",
        verified: e.kind === "refund.completed" && verified,
        attention: false,
        href: `/guardian/${c.id}`,
      });
  }
  const latestRecall = new Map(
    [...recalls]
      .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
      .map((r) => [r.twinId, r.id] as const)
      .reverse(),
  );
  for (const r of recalls) {
    if (!twins.has(r.twinId)) continue;
    items.push({
      id: `recall:${r.id}`,
      twinId: r.twinId,
      kind: "recall",
      at: r.at,
      title: `Saved recall assessment · ${r.state.replaceAll("_", " ")}`,
      detail: `${r.reason} Limited historical notice coverage; physical identity is not certified.`,
      provenance: `Official-source assessment · ${r.hash}`,
      verified: false,
      attention:
        latestRecall.get(r.twinId) === r.id &&
        ["possible_match", "identifiers_match", "more_information"].includes(
          r.state,
        ),
      href: `/safety?twinId=${r.twinId}`,
    });
  }
  return {
    items: [...new Map(items.map((i) => [i.id, i])).values()].sort(
      (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
    ),
    unavailable: [...new Set(unavailable)],
  };
}
