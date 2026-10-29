import { describe, expect, it } from "vitest";
import { customerPageHealthy } from "../../src/lib/intelligence/customer-health";

const health = (code: string, score = 0) => ({
  issues: [],
  widgets: {
    count: {
      widgetType: "value",
      issues: [
        { code: "metric_value_present", score: 1 },
        { code, score },
      ],
    },
    evidence: { widgetType: "documents-care", issues: [] },
  },
});
describe("customer SDK execution health versus visual advice", () => {
  it("accepts observed design/distribution advice without inventing data to improve it", () => {
    for (const code of [
      "layout_alignment",
      "layout_gravity",
      "category_density",
      "data_variance",
    ])
      expect(customerPageHealthy(health(code, 0.67), false)).toBe(true);
  });
  it("rejects invalid mapping, overlap, unavailable values, and unknown diagnostics", () => {
    for (const code of [
      "data_mapping_complete",
      "layout_no_overlap",
      "layout_within_bounds",
      "metric_value_present",
      "data_present",
      "unknown_failure",
    ])
      expect(customerPageHealthy(health(code), false)).toBe(false);
    expect(customerPageHealthy(health("data_mapping_complete"), true)).toBe(
      false,
    );
  });
  it("accepts no-data diagnostics only after fresh query proof of an empty selection", () => {
    for (const code of ["data_present", "metric_value_present"])
      expect(customerPageHealthy(health(code), true)).toBe(true);
  });
  it("fails closed for missing/malformed health and invalid scores", () => {
    expect(
      customerPageHealthy(
        { issues: [], widgets: { grid: { widgetType: "grid", issues: [] } } },
        false,
      ),
    ).toBe(false);
    for (const value of [
      null,
      {},
      { issues: [], widgets: {} },
      health("layout_gravity", -1),
      health("data_present", 2),
      { issues: [], widgets: { count: {} } },
    ])
      expect(customerPageHealthy(value, true)).toBe(false);
    expect(customerPageHealthy(health("data_mapping_complete", 1), false)).toBe(
      true,
    );
  });
  it("needs independent native completion when Studio omits native diagnostics after reset", () => {
    const value = {
      issues: [],
      widgets: { categories: { widgetType: "bar-chart-grouped", issues: [] } },
    };
    expect(customerPageHealthy(value, false)).toBe(false);
    expect(customerPageHealthy(value, false, true)).toBe(true);
    expect(customerPageHealthy(health("data_present"), false, true)).toBe(
      false,
    );
  });
});
