import type { DemoData } from "../../db/schema";
import { findTwin } from "../demo/presentation";
import type { KnowledgeSource } from "./knowledge";

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
): BriefingItem[] {
  const items: BriefingItem[] = [];
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
