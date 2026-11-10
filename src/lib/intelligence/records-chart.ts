import type { AgReportState } from "ag-studio";
import type { CustomerPurchase } from "./customer-model";
import { widgetDefinition } from "./customer-state";
import {
  recordsResultSchema,
  type RecordsResult,
} from "../careos/records/contracts";

export const recordsChartWidgets = [
  "sample-value",
  "sandbox-value",
  "recorded-value-chart",
] as const;

/** A saved-result action is browser presentation only. Reject missing/stale rows
 * instead of charting a different loaded window or silently recomputing facts. */
export function recordsChartState(
  state: AgReportState,
  raw: RecordsResult,
  purchases: CustomerPurchase[],
  compact: boolean,
) {
  const result = recordsResultSchema.parse(raw);
  for (const record of result.records) {
    const actual = purchases.find((p) => p.id === record.id);
    if (
      !actual ||
      actual.amountMinor !== record.amountMinor ||
      actual.origin !== record.origin ||
      actual.purchasedOn !== record.purchasedOn ||
      actual.category !== record.category ||
      actual.name !== record.name ||
      actual.model !== record.model ||
      (actual.receiptHref?.split("/").at(-1) ?? null) !== record.receiptId ||
      JSON.stringify(
        actual.documentLinks
          .slice(0, 100)
          .map((d) => [d.href.split("/").at(-1), d.title])
          .sort(),
      ) !== JSON.stringify(record.documents.map((d) => [d.id, d.title]).sort())
    )
      throw new Error("insights_saved_result_outside_or_changed_window");
  }
  const ids = result.records.map((r) => r.id);
  return {
    ...state,
    selectedPageId: "purchases",
    pages: state.pages.map((page) => {
      if (page.id !== "purchases") return page;
      const bottom = Math.max(
        0,
        ...Object.entries(page.widgetLayout ?? {})
          .filter(
            ([id]) => !recordsChartWidgets.some((w) => id === `extra-${w}`),
          )
          .map(([, p]) => (p?.yTrack ?? 0) + (p?.ySpan ?? 0)),
      );
      if (bottom > 180) throw new Error("insights_saved_analysis_layout_full");
      return {
        ...page,
        crossFilter: undefined,
        filter: {
          ...page.filter,
          page: [
            {
              field: { id: "purchases.id" },
              model: ids.length
                ? {
                    operator: "isIn",
                    value: ids,
                  }
                : { operator: "equals", value: "no-matching-purchase" },
            },
          ],
        },
        widgets: {
          ...page.widgets,
          ...Object.fromEntries(
            recordsChartWidgets.map((widget) => [
              `extra-${widget}`,
              widgetDefinition(widget),
            ]),
          ),
        },
        widgetLayout: {
          ...page.widgetLayout,
          "extra-sample-value": {
            xTrack: 0,
            yTrack: bottom,
            xSpan: compact ? 24 : 12,
            ySpan: 10,
          },
          "extra-sandbox-value": {
            xTrack: compact ? 0 : 12,
            yTrack: bottom + (compact ? 10 : 0),
            xSpan: compact ? 24 : 12,
            ySpan: 10,
          },
          "extra-recorded-value-chart": {
            xTrack: 0,
            yTrack: bottom + (compact ? 20 : 10),
            xSpan: 24,
            ySpan: 24,
          },
        },
        selection: { type: "widget", id: "extra-recorded-value-chart" },
      };
    }),
  } as AgReportState;
}

export function expectedValueForMapping(
  field: string | undefined,
  selected: CustomerPurchase[],
  count: number,
) {
  if (field === "purchases.sampleUsd" || field === "purchases.sandboxUsd") {
    const origin = field === "purchases.sampleUsd" ? "sample" : "sandbox";
    return (
      selected
        .filter((p) => p.origin === origin && p.amountMinor !== null)
        .reduce((sum, p) => sum + p.amountMinor!, 0) / 100
    );
  }
  return count;
}
