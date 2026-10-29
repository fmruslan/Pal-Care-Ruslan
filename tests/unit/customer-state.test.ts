import { describe, it, expect } from "vitest";
import type { AgReportState } from "ag-studio";
import { customerDataset } from "../../src/lib/intelligence/customer-model";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import {
  customerReport,
  commandSelection,
  emptyPurchaseFilters,
  matchingPurchases,
  savedCustomerLayout,
  restoreCustomerLayout,
  customerLayoutSchema,
  defaultCustomerWidgetIds,
  expectedCustomerWidget,
  insightPages,
  insightWidgets,
  validateTarget,
  type InsightPage,
  type InsightWidget,
} from "../../src/lib/intelligence/customer-state";

const dataset = customerDataset(demoData, [referenceSource], emptyOverview(), {
  items: [],
  unavailable: [],
});
const extraPosition = { xTrack: 0, yTrack: 100, xSpan: 24, ySpan: 24 };
function extra(
  state: AgReportState,
  pageId: InsightPage,
  widget: InsightWidget,
) {
  const page = state.pages.find((page) => page.id === pageId)!;
  const id = `extra-${widget}`;
  page.widgets = {
    ...page.widgets,
    [id]: expectedCustomerWidget(pageId, id),
  } as NonNullable<typeof page.widgets>;
  page.widgetLayout = { ...page.widgetLayout, [id]: { ...extraPosition } };
  return page;
}

describe("customer Studio view state", () => {
  it("uses known native and custom widgets in all three presets", () => {
    const state = customerReport();
    expect(state.pages.map((p) => p.id)).toEqual([
      "purchases",
      "documents",
      "adjustments",
    ]);
    expect(state.pages[0].widgets?.grid?.type).toBe("grid");
    expect(state.pages[0].widgets?.categories?.type).toBe("bar-chart-grouped");
    expect(state.pages.every((p) => p.widgets?.count?.type === "value")).toBe(
      true,
    );
    for (const page of state.pages)
      expect(page.widgets?.evidence).toEqual(
        expect.objectContaining({ type: "documents-care" }),
      );
  });
  it("finds product words without treating PayPal evidence as a name or selecting samples", () => {
    const next = commandSelection(
      { operation: "find", query: "PayPal headphones", verifiedOnly: true },
      emptyPurchaseFilters,
    );
    expect(matchingPurchases(dataset.purchases, next.filters)).toEqual([]);
    const samples = matchingPurchases(dataset.purchases, {
      ...next.filters,
      origin: "all",
    });
    expect(samples.map((p) => p.name)).toEqual(["Everyday headphones"]);
    expect(
      matchingPurchases(dataset.purchases, {
        ...emptyPurchaseFilters,
        query: "JBL headphones",
      }),
    ).toEqual([]);
  });
  it("matches care, documents, date, category and attention without fabricating gaps", () => {
    expect(
      matchingPurchases(dataset.purchases, {
        ...emptyPurchaseFilters,
        care: true,
      }).map((p) => p.model),
    ).toEqual(["5"]);
    expect(
      matchingPurchases(dataset.purchases, {
        ...emptyPurchaseFilters,
        attention: true,
      }),
    ).toEqual([]);
    expect(
      matchingPurchases(dataset.purchases, {
        ...emptyPurchaseFilters,
        from: "2099-01-01",
      }),
    ).toEqual([]);
    const category = dataset.purchases[0].category;
    expect(
      matchingPurchases(dataset.purchases, {
        ...emptyPurchaseFilters,
        category,
      }).every((p) => p.category === category),
    ).toBe(true);
  });
});

describe("canonical customer widget capabilities", () => {
  it("has fresh canonical definitions for every default and approved extra", () => {
    const state = customerReport();
    for (const pageId of insightPages) {
      for (const id of defaultCustomerWidgetIds[pageId]) {
        const target = validateTarget(state, pageId, id);
        expect(target.widget).toEqual(expectedCustomerWidget(pageId, id));
        expect(target.widget).not.toBe(expectedCustomerWidget(pageId, id));
      }
      for (const widget of insightWidgets) {
        const page = extra(state, pageId, widget);
        const id = `extra-${widget}`;
        const target = validateTarget(state, pageId, id);
        expect(target.page).toBe(page);
        expect(target.widget).toBe(page.widgets![id]);
        expect(target.layout).toEqual(extraPosition);
      }
    }
    expect(expectedCustomerWidget("documents", "count")).toMatchObject({
      type: "value",
      dataMapping: { value: [{ id: "purchases.count", aggregation: "sum" }] },
    });
    expect(() => expectedCustomerWidget("documents", "grid")).toThrow();
    expect(() => expectedCustomerWidget("purchases", "extra-script")).toThrow();
    expect(() => expectedCustomerWidget("purchases", "constructor")).toThrow();
  });

  it("requires existing canonical targets, not just matching selection strings", () => {
    const state = customerReport();
    const page = state.pages[0];
    page.selection = { type: "widget", id: "categories" };
    expect(
      validateTarget(state, "purchases", "categories", { selected: true }).page,
    ).toBe(page);
    state.selectedPageId = "documents";
    expect(() =>
      validateTarget(state, "purchases", "categories", { selected: true }),
    ).toThrow();
    state.selectedPageId = "purchases";
    page.selection = { type: "widget", id: "evidence" };
    expect(() =>
      validateTarget(state, "purchases", "categories", { selected: true }),
    ).toThrow();
    page.selection = { type: "widget", id: "categories" };
    page.widgets!.categories = expectedCustomerWidget(
      "purchases",
      "grid",
    ) as NonNullable<typeof page.widgets>[string];
    expect(() =>
      validateTarget(state, "purchases", "categories", { selected: true }),
    ).toThrow();
    delete page.widgets!.categories;
    expect(() => validateTarget(state, "purchases", "categories")).toThrow();
    expect(() =>
      validateTarget({ ...state, pages: [] }, "purchases", "categories"),
    ).toThrow();
    expect(() =>
      validateTarget({ ...state, pages: [page, page] }, "purchases", "grid"),
    ).toThrow();
    expect(() => validateTarget(state, "documents", "grid")).toThrow();
  });

  it("checks exact field mappings/aggregations independently of object key order", () => {
    const state = customerReport();
    const page = state.pages[0];
    page.widgets!.categories = {
      type: "bar-chart-grouped",
      dataMapping: {
        valueKey: [{ aggregation: "sum", id: "purchases.count" }],
        categoryKey: [{ id: "purchases.category" }],
      },
    };
    expect(() =>
      validateTarget(state, "purchases", "categories"),
    ).not.toThrow();
    page.widgets!.categories.dataMapping = {
      categoryKey: [{ id: "purchases.name" }],
      valueKey: [{ id: "purchases.count", aggregation: "sum" }],
    };
    expect(() => validateTarget(state, "purchases", "categories")).toThrow();
    page.widgets!.categories.dataMapping = {
      categoryKey: [{ id: "purchases.category" }],
      valueKey: [{ id: "purchases.count", aggregation: "avg" }],
    };
    expect(() => validateTarget(state, "purchases", "categories")).toThrow();
    page.widgets!.categories.dataMapping = {
      categoryKey: [{ id: "purchases.category" }],
      valueKey: [{ id: "purchases.count", aggregation: "sum" }],
      tooltipKey: [{ id: "purchases.paidUsd" }],
    };
    expect(() => validateTarget(state, "purchases", "categories")).toThrow();
    page.widgets!.count = {
      type: "value",
      dataMapping: { value: [{ id: "purchases.paidUsd", aggregation: "sum" }] },
    };
    expect(() => validateTarget(state, "purchases", "count")).toThrow();
  });

  it("requires a bounded position and the intended 24-column coordinate system", () => {
    const state = customerReport();
    const page = state.pages[0];
    delete page.widgetLayout!.grid;
    expect(() => validateTarget(state, "purchases", "grid")).toThrow();
    page.widgetLayout!.grid = { ...extraPosition, xTrack: 23 };
    expect(() => validateTarget(state, "purchases", "grid")).toThrow();
    page.widgetLayout!.grid = { ...extraPosition };
    page.layout = { columns: 12 };
    expect(() => validateTarget(state, "purchases", "grid")).toThrow();
    page.layout = { columns: 24 };
    expect(() => validateTarget(state, "purchases", "grid")).not.toThrow();
  });
});

describe("validated browser-local customer layouts", () => {
  it.each([false, true])(
    "round-trips complete default layouts with compact=%s",
    (compact) => {
      const state = customerReport(compact);
      const saved = savedCustomerLayout(state);
      const restored = restoreCustomerLayout(
        state,
        JSON.parse(JSON.stringify(saved)),
      );
      for (const page of state.pages) {
        const pageId = page.id as InsightPage;
        expect(Object.keys(saved.pages[pageId]).sort()).toEqual(
          [...defaultCustomerWidgetIds[pageId]].sort(),
        );
        expect(
          restored.pages.find((p) => p.id === page.id)?.widgetLayout,
        ).toEqual(page.widgetLayout);
        if (compact)
          expect(
            Object.values(page.widgetLayout!).every(
              (position) => position?.xTrack === 0 && position.xSpan === 24,
            ),
          ).toBe(true);
      }
      expect(restored).toEqual(state);
    },
  );

  it("allows approved extras on each page without requiring absent extras", () => {
    const state = customerReport();
    for (const pageId of insightPages)
      for (const widget of insightWidgets) extra(state, pageId, widget);
    const raw = savedCustomerLayout(state);
    const restored = restoreCustomerLayout(customerReport(), raw);
    for (const pageId of insightPages)
      for (const widget of insightWidgets)
        expect(
          validateTarget(restored, pageId, `extra-${widget}`).expected,
        ).toEqual(expectedCustomerWidget(pageId, `extra-${widget}`));
    expect(savedCustomerLayout(restored)).toEqual(raw);
  });

  it("requires every default widget position on its own page and all three pages", () => {
    for (const pageId of insightPages) {
      for (const widgetId of defaultCustomerWidgetIds[pageId]) {
        const raw = savedCustomerLayout(customerReport());
        delete raw.pages[pageId][widgetId];
        expect(customerLayoutSchema.safeParse(raw).success).toBe(false);
        expect(() => restoreCustomerLayout(customerReport(), raw)).toThrow();
      }
      const raw = savedCustomerLayout(customerReport());
      const { [pageId]: _missing, ...remaining } = raw.pages;
      void _missing;
      expect(
        customerLayoutSchema.safeParse({ ...raw, pages: remaining }).success,
      ).toBe(false);
    }
    const raw = savedCustomerLayout(customerReport());
    raw.pages.documents.grid = { ...extraPosition };
    expect(customerLayoutSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects saving missing/retyped bases, wrong mappings and hidden unknown capabilities", () => {
    const missing = customerReport();
    delete missing.pages[0].widgets!.grid;
    expect(() => savedCustomerLayout(missing)).toThrow();
    const retyped = customerReport();
    retyped.pages[0].widgets!.categories = {
      type: "value",
      dataMapping: { value: [{ id: "purchases.count", aggregation: "sum" }] },
    };
    expect(() => savedCustomerLayout(retyped)).toThrow();
    const mapping = customerReport();
    mapping.pages[0].widgets!.count = {
      type: "value",
      dataMapping: { value: [{ id: "purchases.count", aggregation: "avg" }] },
    };
    expect(() => savedCustomerLayout(mapping)).toThrow();
    const hidden = customerReport();
    hidden.pages[0].widgets!.hidden = {
      type: "value",
      dataMapping: { value: [{ id: "purchases.paidUsd", aggregation: "sum" }] },
    };
    expect(() => savedCustomerLayout(hidden)).toThrow();
  });

  it("reconstructs canonical defaults/extras and removes unsaved, retyped and hidden definitions", () => {
    const original = customerReport();
    extra(original, "purchases", "category-chart");
    const raw = savedCustomerLayout(original);
    const current = customerReport();
    const page = extra(current, "purchases", "attention");
    delete page.widgets!.count;
    delete page.widgets!.grid;
    delete page.widgetLayout!.grid;
    page.widgets!.categories = {
      type: "grid",
      dataMapping: { cols: [{ id: "purchases.name" }] },
      format: { title: { text: "Invented total", enabled: true } },
    };
    page.widgets!["extra-category-chart"] = page.widgets!.categories;
    page.widgets!.hidden = {
      type: "value",
      dataMapping: { value: [{ id: "arbitrary.hidden", aggregation: "sum" }] },
    };
    page.widgetLayout!.hidden = { ...extraPosition };
    const before = structuredClone(current);
    const restored = restoreCustomerLayout(current, raw);
    expect(restored.pages[0].widgets).toEqual(original.pages[0].widgets);
    expect(restored.pages[0].widgetLayout).toEqual(
      original.pages[0].widgetLayout,
    );
    expect(current).toEqual(before);
    expect(current.pages[0]).toBe(page);
  });

  it("preserves current page/predicate/valid-selection and source references without mutation", () => {
    const state = customerReport();
    state.selectedPageId = "documents";
    state.schema = { fields: {} };
    const sourceRef = dataset.purchases;
    const sourceBefore = structuredClone(dataset);
    const page = state.pages[0];
    page.filter = {
      page: [
        {
          field: { id: "purchases.id" },
          model: { operator: "equals", value: dataset.purchases[0].id },
        },
      ],
      widget: {
        grid: [
          {
            field: { id: "purchases.category" },
            model: { operator: "equals", value: "Computing" },
          },
        ],
      },
    };
    page.crossFilter = {
      values: {
        categories: [
          {
            group: 0,
            type: "value",
            field: { id: "purchases.category" },
            values: ["Computing"],
          },
        ],
      },
    };
    page.selection = { type: "widget", id: "categories" };
    const raw = savedCustomerLayout(state);
    raw.pages.purchases.grid = { xTrack: 0, yTrack: 60, xSpan: 24, ySpan: 30 };
    const before = structuredClone(state);
    const restored = restoreCustomerLayout(state, raw);
    expect(restored.selectedPageId).toBe("documents");
    expect(restored.schema).toBe(state.schema);
    expect(restored.pages[0].filter).toBe(page.filter);
    expect(restored.pages[0].crossFilter).toBe(page.crossFilter);
    expect(restored.pages[0].selection).toBe(page.selection);
    expect(restored.pages[0].widgetLayout!.grid).toEqual(
      raw.pages.purchases.grid,
    );
    expect(state).toEqual(before);
    expect(dataset.purchases).toBe(sourceRef);
    expect(dataset).toEqual(sourceBefore);
  });

  it("clears dangling/reinterpreted selections, retaining only known field selections", () => {
    const raw = savedCustomerLayout(customerReport());
    const state = customerReport();
    state.pages[0].selection = { type: "widget", id: "removed" };
    state.pages[1].selection = {
      type: "field",
      field: { id: "purchases.category" },
    };
    state.pages[2].selection = {
      type: "field",
      field: { id: "arbitrary.computed" },
    };
    let restored = restoreCustomerLayout(state, raw);
    expect(restored.pages[0].selection).toBeUndefined();
    expect(restored.pages[1].selection).toBe(state.pages[1].selection);
    expect(restored.pages[2].selection).toBeUndefined();
    state.pages[0].selection = { type: "widget", id: "grid" };
    delete state.pages[0].widgets!.grid;
    restored = restoreCustomerLayout(state, raw);
    expect(restored.pages[0].selection).toBeUndefined();
    expect(validateTarget(restored, "purchases", "grid").widget.type).toBe(
      "grid",
    );
    state.pages[0].selection = { type: "widget", id: "categories" };
    state.pages[0].widgets!.categories = {
      type: "grid",
      dataMapping: { cols: [{ id: "purchases.name" }] },
    };
    expect(
      restoreCustomerLayout(state, raw).pages[0].selection,
    ).toBeUndefined();
  });

  it("fails rather than silently dropping or reinterpreting active filter sources", () => {
    const raw = savedCustomerLayout(customerReport());
    const state = customerReport();
    const page = extra(state, "purchases", "category-chart");
    page.crossFilter = {
      values: {
        "extra-category-chart": [
          {
            group: 0,
            type: "value",
            field: { id: "purchases.category" },
            values: ["Computing"],
          },
        ],
      },
    };
    const before = structuredClone(state);
    expect(() => restoreCustomerLayout(state, raw)).toThrow();
    expect(state).toEqual(before);
    page.crossFilter = {
      values: {
        categories: [
          {
            group: 0,
            type: "value",
            field: { id: "purchases.category" },
            values: ["Computing"],
          },
        ],
      },
    };
    page.widgets!.categories = {
      type: "value",
      dataMapping: { value: [{ id: "purchases.count", aggregation: "sum" }] },
    };
    expect(() => restoreCustomerLayout(state, raw)).toThrow();
    page.crossFilter = undefined;
    page.filter = {
      widget: {
        removed: [
          {
            field: { id: "purchases.category" },
            model: { operator: "equals", value: "Computing" },
          },
        ],
      },
    };
    expect(() => restoreCustomerLayout(state, raw)).toThrow();
    page.filter = {
      page: [
        {
          field: { id: "purchases.category" },
          model: { operator: "equals", value: "Computing" },
          filterWidgetId: "removed",
        },
      ],
    };
    expect(() => restoreCustomerLayout(state, raw)).toThrow();
  });

  it.each([
    { xTrack: -1 },
    { xTrack: 23 },
    { yTrack: 241 },
    { yTrack: 0.5 },
    { xSpan: 3 },
    { xSpan: 25 },
    { ySpan: 5 },
    { ySpan: 81 },
    { xSpan: Number.POSITIVE_INFINITY },
    { href: "javascript:alert(1)" },
  ])(
    "rejects malformed/out-of-bounds positions without changing the current state: %j",
    (change) => {
      const state = customerReport();
      const raw = savedCustomerLayout(state);
      const before = structuredClone(state);
      raw.pages.purchases.grid = { ...extraPosition, ...change };
      expect(() => restoreCustomerLayout(state, raw)).toThrow();
      expect(state).toEqual(before);
    },
  );

  it("rejects scripts, arbitrary widget/page keys and capability-bearing layout payloads", () => {
    const state = customerReport();
    const raw = savedCustomerLayout(state);
    for (const value of [
      { ...raw, script: "evil" },
      { ...raw, widgets: { grid: { type: "script" } } },
      { ...raw, pages: { ...raw.pages, arbitrary: raw.pages.purchases } },
      {
        ...raw,
        pages: {
          ...raw.pages,
          purchases: { ...raw.pages.purchases, evil: extraPosition },
        },
      },
      {
        ...raw,
        pages: {
          ...raw.pages,
          purchases: { ...raw.pages.purchases, "extra-script": extraPosition },
        },
      },
    ])
      expect(() => restoreCustomerLayout(state, value)).toThrow();
    for (const pages of [
      state.pages.slice(1),
      [...state.pages, state.pages[0]],
      [...state.pages.slice(0, 2), { ...state.pages[2], id: "unknown" }],
    ]) {
      expect(() => savedCustomerLayout({ ...state, pages })).toThrow();
      expect(() => restoreCustomerLayout({ ...state, pages }, raw)).toThrow();
    }
    state.pages[0].layout = { columns: 12 };
    expect(() => restoreCustomerLayout(state, raw)).toThrow();
  });
});
