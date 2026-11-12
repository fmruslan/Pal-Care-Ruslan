import type { DemoData } from "../../db/schema";
import { findTwin } from "../demo/presentation";
import { ownershipHref } from "../care/ownership-contracts";
import { contextChoices } from "./context-choices";
import {
  purchaseNavigationSchema,
  type PurchaseNavigation,
} from "./navigation";

/** All destinations come from the existing fixed-customer record projection. */
export function purchaseNavigation(
  data: DemoData,
  twinId: string,
): PurchaseNavigation | null {
  const record = findTwin(data, twinId);
  const choice = contextChoices({
    ...data,
    twins: data.twins.filter((twin) => twin.id === twinId),
  }).find((choice) => choice.context.twinId === twinId);
  if (!record || !choice) return null;
  const href = `/vault/${record.twin.id}`;
  const receipts = record.documents.filter((d) => d.kind === "receipt");
  return purchaseNavigationSchema.parse({
    context: choice.context,
    actions: [
      { destination: "purchase", label: "Open purchase", href },
      ...(receipts.length === 1
        ? [
            {
              destination: "receipt",
              label: "View receipt",
              href: `/documents/${receipts[0].id}`,
            },
          ]
        : []),
      {
        destination: "documents",
        label: "View documents",
        href: `${href}#documents-heading`,
      },
      {
        destination: "care",
        label: "Care details",
        href: `${href}#care-heading`,
      },
      {
        destination: "warranty",
        label: "View warranty details",
        href: ownershipHref(record.twin.id, "warranty"),
      },
      {
        destination: "returns",
        label: "View return details",
        href: ownershipHref(record.twin.id, "returns"),
      },
      { destination: "insights", label: "Open Insights", href: "/insights" },
    ],
  });
}
