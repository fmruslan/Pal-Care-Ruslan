import type { CareDocument } from "../db/schema";
import { tenProductPack } from "./care/demo/catalog";
import {
  consumerDemoDocuments,
  consumerDemoSources,
} from "./care/demo/consumer-evidence";
import { demoData } from "./demo/fixtures";
import type { DocumentCategory } from "./library-navigation";

export type DocumentClassification = Exclude<DocumentCategory, "all"> | "other";
export const documentClassificationLabels: Record<
  DocumentClassification,
  string
> = {
  receipts: "Receipt",
  warranties: "Warranty & coverage",
  care: "Care documents",
  returns: "Return record or policy",
  other: "Other records",
};

/** A display grouping only. Never infer a manual/coverage from a title or prose.
 * Scenario documents must match the trusted ID, exact Twin/product and content.
 * Unrecognized/changed care cards remain accessible under Other records. */
export function classifyLibraryDocument(
  document: CareDocument,
  purchase: { id: string; productId: string; origin: string },
): DocumentClassification {
  if (document.kind === "receipt") return "receipts";
  if (document.kind === "policy") return "returns";
  if (document.origin !== "sample" || purchase.origin !== "sample")
    return "other";

  const scenario = tenProductPack.scenarios.find(
    (s) => s.documentId === document.id,
  );
  if (scenario) {
    const expected = `PAL CARE — SIMULATED EXAMPLE\nAs of ${tenProductPack.asOf}\nNot original purchase terms, a real merchant promise, carrier event, recall confirmation or financial permission.\n${JSON.stringify(scenario, null, 2)}`;
    if (
      scenario.twinId !== purchase.id ||
      document.twinId !== purchase.id ||
      scenario.productId !== purchase.productId ||
      document.content !== expected
    )
      return "other";
    if (scenario.kind === "warranty") return "warranties";
    if (scenario.kind === "return-window") return "returns";
    return "other";
  }

  const source = consumerDemoSources.find((s) => s.documentId === document.id);
  const expected = consumerDemoDocuments.find((d) => d.id === document.id);
  const sourceProduct = tenProductPack.scenarios.find(
    (s) => s.twinId === source?.twinId,
  )?.productId;
  if (
    source &&
    expected &&
    sourceProduct === purchase.productId &&
    source.twinId === purchase.id &&
    document.twinId === purchase.id &&
    document.content === expected.content
  ) {
    return source.kind === "return-progress" ||
      source.kind === "refund-illustration"
      ? "returns"
      : "other";
  }

  const careCard = demoData.documents.find(
    (d) => d.id === "00000000-0000-4000-8000-000000000303",
  );
  return careCard &&
    document.id === careCard.id &&
    document.twinId === careCard.twinId &&
    purchase.id === careCard.twinId &&
    purchase.productId === "00000000-0000-4000-8000-000000000103" &&
    document.content === careCard.content
    ? "care"
    : "other";
}
