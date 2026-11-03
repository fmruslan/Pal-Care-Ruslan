import { describe, expect, it } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { customerDataset } from "../../src/lib/intelligence/customer-model";
import {
  customerReport,
  validateTarget,
  matchingPurchases,
  emptyPurchaseFilters,
} from "../../src/lib/intelligence/customer-state";
import {
  expectedValueForMapping,
  recordsChartState,
  recordsChartWidgets,
} from "../../src/lib/intelligence/records-chart";
import { nativeDisplayVerified } from "../../src/lib/intelligence/customer-observation";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { querySavedRecords } from "../../src/lib/careos/records/service";

const data = customerDataset(demoData, [], null, {
  items: [],
  unavailable: [],
});
const result = querySavedRecords(demoData, emptyRecordsQuery("2026-11-03"));
describe("saved records → native Studio state contract (domain, not browser execution)", () => {
  it.each([false, true])(
    "uses known native widgets, exact identities/mappings/layout and separated values, compact=%s",
    (compact) => {
      const initial = customerReport(compact);
      const state = recordsChartState(initial, result, data.purchases, compact);
      expect(state.selectedPageId).toBe("purchases");
      for (const widget of recordsChartWidgets)
        expect(() =>
          validateTarget(state, "purchases", `extra-${widget}`),
        ).not.toThrow();
      const page = state.pages.find((p) => p.id === "purchases")!;
      expect(page.widgets?.["extra-recorded-value-chart"]?.type).toBe(
        "bar-chart-grouped",
      );
      expect(
        page.widgets?.["extra-recorded-value-chart"]?.format,
      ).toMatchObject({
        title: { text: "Recorded value (USD)" },
        style: {
          theme: { common: { legend: { enabled: true, position: "bottom" } } },
        },
      });
      expect(page.widgets?.["extra-sample-value"]?.dataMapping).toEqual({
        value: [{ id: "purchases.sampleUsd", aggregation: "sum" }],
      });
      expect(page.widgets?.["extra-sandbox-value"]?.dataMapping).toEqual({
        value: [{ id: "purchases.sandboxUsd", aggregation: "sum" }],
      });
      expect(
        initial.pages.find((p) => p.id === "purchases")?.widgets?.[
          "extra-sample-value"
        ],
      ).toBeUndefined();
      expect(state.pages.find((p) => p.id === "documents")).toEqual(
        initial.pages.find((p) => p.id === "documents"),
      );
    },
  );
  it("repeated application is idempotent and does not keep growing the layout", () => {
    const state = recordsChartState(
      customerReport(),
      result,
      data.purchases,
      false,
    );
    expect(recordsChartState(state, result, data.purchases, false)).toEqual(
      state,
    );
  });
  it("rejects an old snapshot changed amount or outside loaded native window", () => {
    expect(() =>
      recordsChartState(
        customerReport(),
        result,
        data.purchases.slice(1),
        false,
      ),
    ).toThrow("outside_or_changed");
    expect(() =>
      recordsChartState(
        customerReport(),
        result,
        data.purchases.map((p, i) => (i ? p : { ...p, amountMinor: 1 })),
        false,
      ),
    ).toThrow("outside_or_changed");
  });
  it("rejects changed receipt/document evidence even if the saved amount and product are unchanged", () => {
    expect(() =>
      recordsChartState(
        customerReport(),
        result,
        data.purchases.map((p) => ({ ...p, receiptHref: null })),
        false,
      ),
    ).toThrow("outside_or_changed");
    expect(() =>
      recordsChartState(
        customerReport(),
        result,
        data.purchases.map((p) => ({ ...p, documentLinks: [] })),
        false,
      ),
    ).toThrow("outside_or_changed");
  });
  it("empty selection uses a false predicate and never becomes all records", () => {
    const empty = querySavedRecords(demoData, {
      ...emptyRecordsQuery("2026-11-03"),
      origin: "sandbox",
    });
    const state = recordsChartState(
      customerReport(),
      empty,
      data.purchases,
      false,
    );
    expect(
      JSON.stringify(state.pages.find((p) => p.id === "purchases")?.filter),
    ).toContain("no-matching-purchase");
    expect(
      matchingPurchases(data.purchases, {
        ...emptyPurchaseFilters,
        recordIds: [],
      }),
    ).toEqual([]);
  });
  it("native monetary checks compare exact calculated values rather than count", () => {
    expect(
      expectedValueForMapping("purchases.sampleUsd", data.purchases, 4),
    ).toBe(307);
    expect(
      expectedValueForMapping("purchases.sandboxUsd", data.purchases, 4),
    ).toBe(0);
    expect(
      nativeDisplayVerified(
        [
          { type: "value", ready: true, value: 307, expectedValue: 307 },
          { type: "grid", ready: true, rows: 4 },
        ],
        4,
      ),
    ).toBe(true);
    expect(
      nativeDisplayVerified(
        [{ type: "value", ready: true, value: 4, expectedValue: 307 }],
        4,
      ),
    ).toBe(false);
  });
});
