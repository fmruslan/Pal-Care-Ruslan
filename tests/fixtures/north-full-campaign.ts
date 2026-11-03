/** New campaign only. This manifest grants no provider/accounting authority and
 * never imports, extends or resets an earlier batch. Inputs/oracles must be
 * frozen separately before dispatch; declared slots are not completed tests. */
export const NORTH_FULL_CAMPAIGN = "north-full-makeover-200-v1";
export const northFullDistribution = [
  { category: "purchase-search", initial: 18, regression: 9, final: 3 },
  { category: "spending-analytics", initial: 18, regression: 9, final: 3 },
  { category: "memory-followups", initial: 18, regression: 9, final: 3 },
  { category: "grounded-care", initial: 15, regression: 8, final: 2 },
  { category: "context-switching", initial: 15, regression: 8, final: 2 },
  {
    category: "formats-documents-charts",
    initial: 15,
    regression: 7,
    final: 3,
  },
  { category: "complex-multistep", initial: 12, regression: 6, final: 2 },
  { category: "recovery-edges", initial: 9, regression: 4, final: 2 },
] as const;
export const northFullSlots = (
  ["initial", "regression", "final"] as const
).flatMap((wave) =>
  northFullDistribution.flatMap((group) =>
    Array.from({ length: group[wave] }, (_, i) => ({
      id: `${NORTH_FULL_CAMPAIGN}:${wave}:${group.category}:${String(i + 1).padStart(2, "0")}`,
      category: group.category,
      wave,
    })),
  ),
);
