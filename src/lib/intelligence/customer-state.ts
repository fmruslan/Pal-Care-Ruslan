import { z } from "zod";
import type { AgReportState } from "ag-studio";
import type { CustomerPurchase } from "./customer-model";
import type { CustomerCommand } from "./customer-commands";

export const insightPages = ["purchases", "documents", "adjustments"] as const;
export type InsightPage = (typeof insightPages)[number];
export const insightWidgets = [
  "purchase-grid",
  "category-chart",
  "documents-care",
  "attention",
  "adjustments",
] as const;
export type InsightWidget = (typeof insightWidgets)[number];
export type PurchaseFilters = {
  origin: string;
  category: string;
  from: string;
  to: string;
  documents: boolean;
  care: boolean;
  attention: boolean;
  verified: boolean;
  query: string;
};
export const emptyPurchaseFilters: PurchaseFilters = {
  origin: "all",
  category: "all",
  from: "",
  to: "",
  documents: false,
  care: false,
  attention: false,
  verified: false,
  query: "",
};

export function matchingPurchases(
  purchases: CustomerPurchase[],
  filters: PurchaseFilters,
) {
  // Provider/provenance words describe evidence, not part of a product's name.
  const query = filters.query
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (word) =>
        word &&
        ![
          "paypal",
          "verified",
          "sandbox",
          "receipt",
          "purchase",
          "my",
        ].includes(word),
    );
  return purchases.filter(
    (p) =>
      (filters.origin === "all" || p.origin === filters.origin) &&
      (filters.category === "all" || p.category === filters.category) &&
      (!filters.from || p.purchasedOn >= filters.from) &&
      (!filters.to || p.purchasedOn <= filters.to) &&
      (!filters.documents || p.documentCount > 0) &&
      (!filters.care || p.careAvailable) &&
      (!filters.attention || p.attentionCount > 0) &&
      (!filters.verified || p.verifiedAdjustmentMinor > 0) &&
      query.every((word) =>
        `${p.name} ${p.model} ${p.category}`.toLowerCase().includes(word),
      ),
  );
}

export function commandSelection(
  command: CustomerCommand,
  filters: PurchaseFilters,
): { page?: InsightPage; filters: PurchaseFilters } {
  switch (command.operation) {
    case "reset":
    case "purchases":
      return { page: "purchases", filters: { ...emptyPurchaseFilters } };
    case "category":
      return { page: "purchases", filters };
    case "documents":
      return {
        page: "documents",
        filters: { ...emptyPurchaseFilters, documents: true },
      };
    case "care":
      return {
        page: "documents",
        filters: { ...emptyPurchaseFilters, care: true },
      };
    case "attention":
      return {
        page: "documents",
        filters: { ...emptyPurchaseFilters, attention: true },
      };
    case "verified-adjustments":
      return {
        page: "adjustments",
        filters: { ...emptyPurchaseFilters, verified: true },
      };
    case "find":
      return {
        page: "purchases",
        filters: {
          ...emptyPurchaseFilters,
          query: command.query,
          origin: command.verifiedOnly ? "sandbox" : "all",
        },
      };
    case "filter":
      return { filters: { ...filters, [command.field]: command.value } };
    default:
      return { filters };
  }
}

export function widgetDefinition(widget: InsightWidget) {
  if (widget === "purchase-grid")
    return {
      type: "grid" as const,
      dataMapping: {
        cols: [
          "name",
          "category",
          "purchasedOn",
          "provenance",
          "paidUsd",
          "documentCount",
        ].map((id) => ({ id: `purchases.${id}` })),
      },
      format: { title: { enabled: true, text: "Saved purchases" } },
    };
  if (widget === "category-chart")
    return {
      type: "bar-chart-grouped" as const,
      dataMapping: {
        categoryKey: [{ id: "purchases.category" }],
        valueKey: [{ id: "purchases.count", aggregation: "sum" as const }],
      },
      format: { title: { enabled: true, text: "Purchases by category" } },
    };
  return { type: widget, dataMapping: {} };
}

export const defaultCustomerWidgetIds = {
  purchases: ["count", "categories", "grid", "evidence"],
  documents: ["count", "attention", "evidence"],
  adjustments: ["count", "adjustments", "evidence"],
} as const satisfies Record<InsightPage, readonly string[]>;

/** Fresh application-owned definitions; stored layouts never supply capabilities. */
export function expectedCustomerWidget(pageId: InsightPage, widgetId: string) {
  if (!insightPages.includes(pageId))
    throw new Error("insights_widget_not_allowed");
  if (widgetId.startsWith("extra-")) {
    const widget = widgetId.slice(6) as InsightWidget;
    if (insightWidgets.includes(widget)) return widgetDefinition(widget);
  }
  if (
    !(defaultCustomerWidgetIds[pageId] as readonly string[]).includes(widgetId)
  )
    throw new Error("insights_widget_not_allowed");
  if (widgetId === "count")
    return {
      type: "value" as const,
      dataMapping: {
        value: [{ id: "purchases.count", aggregation: "sum" as const }],
      },
      format: { title: { enabled: true, text: "Purchases in this view" } },
    };
  if (widgetId === "categories") return widgetDefinition("category-chart");
  if (widgetId === "grid") return widgetDefinition("purchase-grid");
  if (widgetId === "evidence") return widgetDefinition("documents-care");
  if (widgetId === "attention") return widgetDefinition("attention");
  return widgetDefinition("adjustments");
}

export function customerReport(compact = false): AgReportState {
  const position = (x: number, y: number, width: number, height: number) => ({
    xTrack: compact ? 0 : x,
    yTrack: y,
    xSpan: compact ? 24 : width,
    ySpan: height,
  });
  return {
    pages: insightPages.map((id) => ({
      id,
      name:
        id === "purchases"
          ? "My Purchases"
          : id === "documents"
            ? "Documents & Care"
            : "Price Adjustments",
      widgets: Object.fromEntries(
        defaultCustomerWidgetIds[id].map((widgetId) => [
          widgetId,
          expectedCustomerWidget(id, widgetId),
        ]),
      ),
      widgetLayout: {
        count: position(0, 0, id === "purchases" ? 8 : 6, 10),
        ...(id === "purchases"
          ? {
              categories: position(8, compact ? 10 : 0, 16, 20),
              grid: position(0, compact ? 30 : 20, 24, 22),
            }
          : {}),
        ...(id === "documents"
          ? { attention: position(6, compact ? 10 : 0, 18, 22) }
          : {}),
        ...(id === "adjustments"
          ? { adjustments: position(6, compact ? 10 : 0, 18, 24) }
          : {}),
        evidence: position(
          0,
          id === "purchases" ? (compact ? 52 : 42) : compact ? 34 : 24,
          24,
          25,
        ),
      },
    })),
    selectedPageId: "purchases",
    panels: {
      data: { collapsed: true },
      edit: { collapsed: true },
      filters: { collapsed: true },
    },
  } as AgReportState;
}

const positionSchema = z
  .strictObject({
    xTrack: z.int().min(0).max(23),
    yTrack: z.int().min(0).max(240),
    xSpan: z.int().min(4).max(24),
    ySpan: z.int().min(6).max(80),
  })
  .refine((p) => p.xTrack + p.xSpan <= 24);
const knownWidget = z.enum([
  "count",
  "categories",
  "grid",
  "attention",
  "adjustments",
  "evidence",
  ...insightWidgets.map((id) => `extra-${id}`),
] as [string, ...string[]]);
export const customerLayoutSchema = z
  .strictObject({
    version: z.literal(1),
    pages: z.record(
      z.enum(insightPages),
      z.partialRecord(knownWidget, positionSchema),
    ),
  })
  .superRefine(({ pages }, context) => {
    for (const pageId of insightPages) {
      for (const widgetId of defaultCustomerWidgetIds[pageId]) {
        if (!Object.hasOwn(pages[pageId], widgetId))
          context.addIssue({
            code: "custom",
            message: "A default widget position is required.",
            path: ["pages", pageId, widgetId],
          });
      }
      for (const widgetId of Object.keys(pages[pageId])) {
        try {
          expectedCustomerWidget(pageId, widgetId);
        } catch {
          context.addIssue({
            code: "custom",
            message: "This widget does not belong to the page.",
            path: ["pages", pageId, widgetId],
          });
        }
      }
    }
  });

const fieldReferenceSchema = z.strictObject({
  id: z.string(),
  aggregation: z
    .enum(["sum", "avg", "min", "max", "count", "countd", "first", "last"])
    .optional(),
});
const mappingSchema = z.record(z.string(), z.array(fieldReferenceSchema));
function normalizedMapping(value: unknown) {
  const mapping = mappingSchema.parse(value);
  return JSON.stringify(
    Object.keys(mapping)
      .sort()
      .map((key) => [key, mapping[key]]),
  );
}

/**
 * Checks a real SDK target, not a selection string or cached rows. Pass
 * { selected: true } for active-page/selection postconditions as well. Data
 * freshness, widget health and actual DOM focus remain the caller's checks.
 */
export function validateTarget(
  state: AgReportState,
  pageId: InsightPage,
  widgetId: string,
  options: { selected?: boolean } = {},
) {
  const expected = expectedCustomerWidget(pageId, widgetId);
  const pages = state.pages.filter((page) => page.id === pageId);
  if (pages.length !== 1) throw new Error("insights_target_unverified");
  const page = pages[0];
  const widget = page.widgets?.[widgetId];
  if (
    !page.widgets ||
    !Object.hasOwn(page.widgets, widgetId) ||
    !widget ||
    widget.type !== expected.type ||
    normalizedMapping(widget.dataMapping) !==
      normalizedMapping(expected.dataMapping) ||
    (page.layout?.columns !== undefined && page.layout.columns !== 24) ||
    !page.widgetLayout ||
    !Object.hasOwn(page.widgetLayout, widgetId)
  )
    throw new Error("insights_target_unverified");
  const layout = positionSchema.parse(page.widgetLayout[widgetId]);
  if (
    options.selected &&
    (state.selectedPageId !== pageId ||
      page.selection?.type !== "widget" ||
      page.selection.id !== widgetId)
  )
    throw new Error("insights_target_unverified");
  return { page, widget, layout, expected };
}

function knownPages(state: AgReportState) {
  if (
    state.pages.length !== insightPages.length ||
    insightPages.some(
      (id) => state.pages.filter((page) => page.id === id).length !== 1,
    ) ||
    !insightPages.includes(state.selectedPageId as InsightPage)
  )
    throw new Error("insights_pages_unverified");
  return state.pages;
}

export function savedCustomerLayout(state: AgReportState) {
  const pages = knownPages(state);
  const saved = customerLayoutSchema.parse({
    version: 1,
    pages: Object.fromEntries(pages.map((p) => [p.id, p.widgetLayout])),
  });
  for (const page of pages) {
    const ids = Object.keys(saved.pages[page.id as InsightPage]);
    if (Object.keys(page.widgets ?? {}).some((id) => !ids.includes(id)))
      throw new Error("insights_widgets_unverified");
    for (const id of ids) validateTarget(state, page.id as InsightPage, id);
  }
  return saved;
}

const purchaseFieldIds = new Set(
  [
    "id",
    "name",
    "category",
    "purchasedOn",
    "provenance",
    "paidUsd",
    "documentCount",
    "careCount",
    "attentionCount",
    "count",
  ].map((id) => `purchases.${id}`),
);

export function restoreCustomerLayout(state: AgReportState, raw: unknown) {
  const saved = customerLayoutSchema.parse(raw);
  const pages = knownPages(state);
  const restored = {
    ...state,
    pages: pages.map((page) => {
      const positions = saved.pages[page.id as InsightPage];
      const widgets = Object.fromEntries(
        Object.keys(positions).map((id) => [
          id,
          expectedCustomerWidget(page.id as InsightPage, id),
        ]),
      );
      // Never drop an active predicate because its originating widget would be
      // removed or reinterpreted. Refuse the restore instead of broadening data.
      const activeSources = Object.entries(page.crossFilter?.values ?? {})
        .filter(([, selections]) => selections.length > 0)
        .map(([id]) => id);
      for (const id of activeSources) {
        if (!Object.hasOwn(widgets, id))
          throw new Error("insights_layout_context_unverified");
        validateTarget(state, page.id as InsightPage, id);
      }
      const filters = [
        ...(page.filter?.page ?? []),
        ...Object.entries(page.filter?.widget ?? {}).flatMap(([id, values]) => {
          if (values.length && !Object.hasOwn(widgets, id))
            throw new Error("insights_layout_context_unverified");
          return values;
        }),
      ];
      if (
        filters.some(
          (filter) =>
            filter.filterWidgetId &&
            !Object.hasOwn(widgets, filter.filterWidgetId),
        )
      )
        throw new Error("insights_layout_context_unverified");
      let selection = page.selection;
      if (selection?.type === "widget") {
        try {
          if (!Object.hasOwn(widgets, selection.id)) throw new Error();
          validateTarget(state, page.id as InsightPage, selection.id);
        } catch {
          selection = undefined;
        }
      } else if (selection?.type === "field") {
        const field = fieldReferenceSchema.safeParse(selection.field);
        if (!field.success || !purchaseFieldIds.has(field.data.id))
          selection = undefined;
      }
      return {
        ...page,
        widgets,
        widgetLayout: positions,
        selection,
      };
    }),
  } as AgReportState;
  for (const page of restored.pages)
    for (const id of Object.keys(page.widgets ?? {}))
      validateTarget(restored, page.id as InsightPage, id);
  return restored;
}
