import { describe, it, expect } from "vitest";
import {
  stratifyLanguageWork,
  plannedCalls,
  adjustedAttemptTargets,
} from "../fixtures/north-language-stratification";
import {
  conversationScenarios,
  languageGoals,
} from "../fixtures/north-language-library";
describe("genuine campaign stratification, definitions only", () => {
  const core = conversationScenarios.flatMap((s, i) =>
    s.inputs.map((input, n) => ({
      id: `${s.id}-${n + 1}`,
      group: s.id,
      category: s.category,
      input,
      goal: languageGoals[
        (i === 0 && [6, 7].includes(n)) ||
        (i === 11 && [5, 6].includes(n)) ||
        (i === 22 && [0, 1].includes(n))
          ? 11
          : 0
      ],
      expected: s.expected,
    })),
  );
  it("keeps all 24 real conversations, budgets the long-context requirement explicitly and freezes a separate 30-call holdout", () => {
    const result = stratifyLanguageWork(core);
    expect(result.work.slice(0, core.length)).toEqual(core);
    expect(
      Object.values(adjustedAttemptTargets).reduce((a, b) => a + b, 0),
    ).toBe(300);
    expect(result.plannedDiscoveryCalls).toBe(270);
    expect(plannedCalls(result.holdout)).toBe(30);
    expect(result.holdout.filter((w) => w.category === "safety")).toHaveLength(
      10,
    );
    expect(
      new Set([...result.work, ...result.holdout].map((w) => w.id)).size,
    ).toBe(result.work.length + result.holdout.length);
  });
  it("includes all ten categories and executes real prior turns rather than dropping contextual safety/correction cases", () => {
    const { work, holdout } = stratifyLanguageWork(core);
    for (const category of Object.keys(adjustedAttemptTargets))
      expect(work.some((w) => w.category === category)).toBe(true);
    expect(
      plannedCalls(work.filter((w) => w.category === "safety")) +
        plannedCalls(holdout.filter((w) => w.category === "safety")),
    ).toBeGreaterThanOrEqual(28);
    expect(
      work.some(
        (w) => w.category === "corrections" && w.id.includes("-SETUP-"),
      ),
    ).toBe(true);
    const heldInputs = new Set(
      holdout.filter((w) => !w.id.includes("-SETUP-")).map((w) => w.input),
    );
    expect(work.filter((w) => heldInputs.has(w.input))).toHaveLength(0);
    for (const item of [...work, ...holdout].filter((w) =>
      w.id.includes("-SETUP-"),
    ))
      expect(languageGoals.some((g) => g.request === item.input)).toBe(true);
  });
});
