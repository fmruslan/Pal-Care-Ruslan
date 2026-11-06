import { describe, expect, it } from "vitest";
import {
  buildLanguageLibrary,
  categoryTargets,
  conversationScenarios,
  languageGoals,
} from "../fixtures/north-language-library";

describe("offline North language library (no inference)", () => {
  it("has exactly 1,050 stable cases and the approved 300-attempt stratification", () => {
    const cases = buildLanguageLibrary();
    expect(cases).toHaveLength(1050);
    expect(new Set(cases.map((c) => c.id)).size).toBe(1050);
    expect(
      new Set(cases.map((c) => JSON.stringify([c.input, c.context]))).size,
    ).toBe(1050);
    expect(buildLanguageLibrary()).toEqual(cases);
    expect(
      Object.values(categoryTargets).reduce((n, [, calls]) => n + calls, 0),
    ).toBe(300);
    for (const [category, [count]] of Object.entries(categoryTargets))
      expect(cases.filter((c) => c.category === category)).toHaveLength(count);
  });
  it("provides at least ten exact independent phrasings for every important intention", () => {
    const cases = buildLanguageLibrary();
    for (const goal of languageGoals)
      expect(
        new Set(
          cases
            .filter((c) => c.category === "equivalent" && c.goal.id === goal.id)
            .map((c) => c.input),
        ).size,
      ).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(c.expected.semantic.length).toBeGreaterThan(10);
      expect(c.expected.never).toContain(
        "Claim unexecuted SDK/financial actions completed",
      );
      expect(c.expected.verification.length).toBeGreaterThan(1);
      expect(c.expected.requiredEvidence.length).toBeGreaterThan(0);
    }
  });
  it("defines 24 actual conversations including the owner's exact journey and long context", () => {
    expect(conversationScenarios).toHaveLength(24);
    expect(conversationScenarios[0].inputs).toHaveLength(9);
    expect(conversationScenarios[0].inputs[0]).toBe(
      "cn u find my paypal hedphones recipt",
    );
    for (const length of [2, 5, 10, 25, 30])
      expect(
        conversationScenarios.some((s) => s.inputs.length === length),
      ).toBe(true);
    expect(new Set(conversationScenarios.map((s) => s.category))).toEqual(
      new Set(Object.keys(categoryTargets)),
    );
  });
  it("keeps empty/overlong/repeated inputs as bounded deterministic checks, not padded live attempts", () => {
    const cases = buildLanguageLibrary();
    expect(cases.filter((c) => c.input === "")).toHaveLength(5);
    expect(
      cases
        .filter((c) => c.input.length > 2000)
        .every((c) => c.expected.inference === "deterministic"),
    ).toBe(true);
    expect(
      cases
        .filter((c) => c.category === "ambiguity")
        .every((c) => c.expected.clarification === "required"),
    ).toBe(true);
  });
});
