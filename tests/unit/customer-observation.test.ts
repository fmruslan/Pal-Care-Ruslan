import { describe, expect, it } from "vitest";
import {
  observedWidgets,
  nativeDisplayVerified,
  stateFingerprint,
  type WidgetObservation,
} from "../../src/lib/intelligence/customer-observation";
describe("fresh complete SDK observations", () => {
  it("requires native count, grid and chart readiness, not an empty health response", () => {
    const displays = [
      { type: "value" as const, ready: true, value: 2 },
      { type: "grid" as const, ready: true, rows: 2 },
      { type: "bar-chart-grouped" as const, ready: true },
    ];
    expect(nativeDisplayVerified(displays, 2)).toBe(true);
    expect(nativeDisplayVerified(displays, 1)).toBe(false);
    expect(
      nativeDisplayVerified(
        [...displays.slice(0, 2), { type: "bar-chart-grouped", ready: false }],
        2,
      ),
    ).toBe(false);
    expect(nativeDisplayVerified([], 0)).toBe(false);
    expect(
      nativeDisplayVerified(
        [
          { type: "value", ready: true, value: 0 },
          { type: "grid", ready: true, rows: 0 },
        ],
        0,
      ),
    ).toBe(true);
  });
  const result = (
    id: string,
    rows: string[] | null = ["a"],
  ): WidgetObservation => ({ id, rows, page: "documents", generation: 2 });
  it("never establishes completion from only the evidence widget or stale results", () => {
    const map = new Map([
      ["evidence", result("evidence")],
      ["attention", { ...result("attention"), generation: 1 }],
    ]);
    expect(
      observedWidgets(["evidence", "attention"], map, 2, "documents", ["a"]),
    ).toBe("waiting");
    map.set("attention", { ...result("attention"), page: "purchases" });
    expect(
      observedWidgets(["evidence", "attention"], map, 2, "documents", ["a"]),
    ).toBe("waiting");
    map.set("attention", result("attention"));
    expect(
      observedWidgets(["evidence", "attention"], map, 2, "documents", ["a"]),
    ).toBe("complete");
  });
  it("rejects failed, duplicate and mismatched custom widget results", () => {
    for (const rows of [null, ["a", "a"], ["b"]])
      expect(
        observedWidgets(
          ["adjustments"],
          new Map([["adjustments", result("adjustments", rows)]]),
          2,
          "documents",
          ["a"],
        ),
      ).toBe("failed");
  });
  it("accepts a fresh empty selection only after every relevant widget completes", () => {
    const map = new Map([
      ["evidence", result("evidence", [])],
      ["extra-adjustments", result("extra-adjustments", [])],
    ]);
    expect(observedWidgets([...map.keys()], map, 2, "documents", [])).toBe(
      "complete",
    );
  });
  it("compares semantic state but detects mid-execution scope, page and layout changes", () => {
    const state = {
      selectedPageId: "purchases",
      filter: { origin: "sandbox", category: "Audio" },
      layout: { xSpan: 24 },
    };
    expect(stateFingerprint(state)).toBe(
      stateFingerprint({
        layout: { xSpan: 24 },
        filter: { category: "Audio", origin: "sandbox" },
        selectedPageId: "purchases",
      }),
    );
    for (const changed of [
      { ...state, selectedPageId: "documents" },
      { ...state, filter: { origin: "sample" } },
      { ...state, layout: { xSpan: 12 } },
    ])
      expect(stateFingerprint(changed)).not.toBe(stateFingerprint(state));
  });
});
