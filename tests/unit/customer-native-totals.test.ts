import { describe, expect, it } from "vitest";
import {
  customerReport,
  expectedCustomerWidget,
  savedCustomerLayout,
  restoreCustomerLayout,
} from "../../src/lib/intelligence/customer-state";

describe("focused native Insights defaults", () => {
  it("shows provenance-separated value KPIs by default, not a merged spending number", () => {
    const report = customerReport();
    const page = report.pages!.find((p) => p.id === "purchases")!;
    expect(page.widgets!["extra-sample-value"]).toEqual(
      expectedCustomerWidget("purchases", "extra-sample-value"),
    );
    expect(page.widgets!["extra-sandbox-value"]).toEqual(
      expectedCustomerWidget("purchases", "extra-sandbox-value"),
    );
    expect(page.widgets!["extra-sample-value"]?.dataMapping).toEqual({
      value: [{ id: "purchases.sampleUsd", aggregation: "sum" }],
    });
    expect(page.widgets!["extra-sandbox-value"]?.dataMapping).toEqual({
      value: [{ id: "purchases.sandboxUsd", aggregation: "sum" }],
    });
    expect(page.widgets!.grid!.type).toBe("grid");
    expect(page.widgets!.categories!.type).toBe("bar-chart-grouped");
  });
  it("keeps both native values reachable in the compact validated layout", () => {
    const page = customerReport(true).pages!.find((p) => p.id === "purchases")!;
    const sample = page.widgetLayout!["extra-sample-value"]!;
    const sandbox = page.widgetLayout!["extra-sandbox-value"]!;
    expect(sample.xSpan).toBe(24);
    expect(sandbox.xSpan).toBe(24);
    expect(sample.yTrack + sample.ySpan).toBeLessThanOrEqual(sandbox.yTrack);
    expect(sandbox.yTrack + sandbox.ySpan).toBeLessThanOrEqual(
      page.widgetLayout!.count!.yTrack,
    );
  });
  it("still restores pre-redesign browser layouts without replacing their positions", () => {
    const report = customerReport();
    const old = savedCustomerLayout(report);
    delete old.pages.purchases["extra-sample-value"];
    delete old.pages.purchases["extra-sandbox-value"];
    const restored = restoreCustomerLayout(report, old);
    expect(
      restored.pages.find((p) => p.id === "purchases")!.widgetLayout,
    ).toEqual(old.pages.purchases);
    expect(
      Object.keys(restored.pages.find((p) => p.id === "purchases")!.widgets!),
    ).not.toContain("extra-sample-value");
  });
});
