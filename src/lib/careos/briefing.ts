import type { DemoData } from "../../db/schema";
import { findTwin } from "../demo/presentation";
import type { KnowledgeSource } from "./knowledge";
import type { GuardianView } from "../price-guardian/contracts";
import { money } from "../demo/presentation";
import type { PurchaseActivity } from "./activity";

export type BriefingItem = {
  id: string;
  title: string;
  detail: string;
  provenance: string;
  sourceHref: string;
  action: { label: string; href: string };
};
export function buildBriefing(
  data: DemoData,
  sources: KnowledgeSource[],
  guardian: GuardianView[] = [],
  activity?: PurchaseActivity,
): BriefingItem[] {
  const items: BriefingItem[] = [];
  for (const item of (activity?.items ?? [])
    .filter((i) => i.kind === "recall" && i.attention)
    .slice(0, 1))
    items.push({
      id: item.id,
      title: item.title,
      detail: item.detail,
      provenance: item.provenance,
      sourceHref: item.href,
      action: { label: "Review recall evidence", href: item.href },
    });
  if (activity?.unavailable.length)
    items.push({
      id: `unavailable:${activity.unavailable.join(":")}`,
      title: "Some aftercare evidence is unavailable",
      detail: `${activity.unavailable.join(", ")} could not be read. Your saved purchase and receipt remain available; no all-clear is implied.`,
      provenance: "Partial read-only activity",
      sourceHref: "/vault",
      action: { label: "Review saved purchases", href: "/vault" },
    });
  for (const c of guardian
    .filter((c) => !["failed", "cancelled", "expired"].includes(c.state))
    .slice(0, 2))
    items.push({
      id: `guardian:${c.id}:${c.revision}:${c.state}`,
      title:
        c.state === "completed"
          ? `${money(c.amountMinor)} refunded in PayPal Sandbox`
          : `${money(c.amountMinor)} merchant price adjustment found`,
      detail:
        c.state === "completed"
          ? "The refund was independently verified. Your original receipt is unchanged."
          : `CareOS found the opportunity automatically. ${c.state === "awaiting_approval" ? "Awaiting merchant approval; you don’t need to submit a claim." : c.state === "pending" ? "PayPal reports pending, not completed." : c.state === "unknown" || c.state === "review" ? "The outcome needs review. Further refunds are blocked." : "Approval or submission is recorded, not a completed refund."}`,
      provenance: `${c.priceOrigin === "controlled_demo" ? "Controlled demo price" : "Recorded merchant price"} · ${c.policyVersion}`,
      sourceHref: `/guardian/${c.id}`,
      action: { label: "View price adjustment", href: `/guardian/${c.id}` },
    });
  const receipts = data.twins
    .map((twin) => findTwin(data, twin.id))
    .filter((r) => r && r.documents.some((d) => d.kind === "receipt"));
  const primary =
    receipts.find((r) => r!.twin.origin === "sandbox") ?? receipts[0];
  if (primary) {
    const receipt = primary.documents.find((d) => d.kind === "receipt")!;
    items.push({
      id: `receipt:${receipt.id}:${primary.twin.verifiedAt ?? "sample"}`,
      title: `${primary.product.name}: receipt ready`,
      detail:
        primary.twin.origin === "sandbox"
          ? "PayPal Sandbox payment verified. Open the saved receipt."
          : "Saved with this sample Twin. No payment was processed.",
      provenance:
        primary.twin.origin === "sandbox"
          ? "Verified Sandbox purchase"
          : "Fictional sample purchase",
      sourceHref: `/documents/${receipt.id}`,
      action: { label: "View receipt", href: `/documents/${receipt.id}` },
    });
  }
  for (const twin of data.twins) {
    const record = findTwin(data, twin.id);
    if (!record) continue;
    const source = sources.find(
      (s) =>
        s.productId === record.product.id &&
        s.brand === record.product.brand &&
        s.model === record.product.model &&
        s.status === "approved",
    );
    if (source) {
      items.push({
        id: `care:${twin.id}:${source.contentHash}`,
        title: `${record.product.name}: care guidance available`,
        detail: "Official guidance for safe shutdown, matched to this model.",
        provenance: `Sample ownership · ${source.publisher} documentation`,
        sourceHref: `/vault/${twin.id}/care#source-${source.id}`,
        action: {
          label: "Explore product care",
          href: `/vault/${twin.id}/care`,
        },
      });
      break;
    }
  }
  return items.slice(0, 2);
}
