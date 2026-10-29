import { z } from "zod";

const issue = z.object({
  code: z.string().min(1),
  score: z.number().min(0).max(1),
});
const pageHealth = z.object({
  issues: z.array(issue),
  widgets: z.record(
    z.string(),
    z.object({ widgetType: z.string(), issues: z.array(issue) }),
  ),
});

// Studio 3.0 scores these visual/data-distribution recommendations, not tool
// execution errors. A correct single-category selection can have no variance;
// making up more data to improve that score would be incorrect.
const advisory = new Set([
  "layout_alignment",
  "layout_gravity",
  "category_density",
  "data_variance",
]);

export function customerPageHealthy(
  value: unknown,
  verifiedEmpty: boolean,
  nativeCompleted = false,
): boolean {
  const result = pageHealth.safeParse(value);
  if (!result.success || !Object.keys(result.data.widgets).length) return false;
  // Missing native diagnostics alone never establish readiness. Studio can
  // also omit chart diagnostics after reset: the caller may instead supply
  // independently checked native DOM completion plus fresh data-engine rows.
  for (const widget of Object.values(result.data.widgets)) {
    if (
      !nativeCompleted &&
      ["value", "grid", "bar-chart-grouped"].includes(widget.widgetType) &&
      !widget.issues.some(
        (entry) =>
          (verifiedEmpty && entry.code === "data_present") ||
          (widget.widgetType === "value"
            ? entry.code === "metric_value_present"
            : entry.code === "data_variance"),
      )
    )
      return false;
  }
  return [
    ...result.data.issues,
    ...Object.values(result.data.widgets).flatMap((w) => w.issues),
  ].every(
    (entry) =>
      entry.score === 1 ||
      advisory.has(entry.code) ||
      (verifiedEmpty &&
        ["data_present", "metric_value_present"].includes(entry.code)),
  );
}
