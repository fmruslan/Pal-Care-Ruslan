import { describe, expect, it } from "vitest";
import {
  productGuideAnswer,
  productGuideReplySchema,
} from "../../src/lib/careos/product-guide";

const reply = () => ({
  text: "Use the saved records in Purchases & Docs, then inspect their sources.",
  steps: ["Open the intended dated purchase and review its saved documents."],
  features: ["library" as const, "receipts" as const],
});
const prohibited = [...Array.from({ length: 32 }, (_, n) => n), 127].filter(
  (n) => ![9, 10, 13].includes(n),
);
describe("bounded readable product-guide output", () => {
  it.each(prohibited)(
    "rejects control U+%i in text or a step without rewriting it",
    (code) => {
      for (const field of ["text", "steps"] as const) {
        const input = reply();
        if (field === "text") input.text += String.fromCharCode(code);
        else input.steps[0] += String.fromCharCode(code);
        const original = structuredClone(input);
        expect(productGuideReplySchema.safeParse(input).success).toBe(false);
        expect(() => productGuideAnswer(input)).toThrow();
        expect(input).toEqual(original);
      }
    },
  );
  it("retains the genuine NG-0046 backspace/truncated step as invalid, never fabricating zero", () => {
    const input = reply();
    input.steps = [
      "Use Insights → Filters & sort to narrow by category, source, date, or search. Check the scope and counts; Example and Sandbox amounts remain separate, and missing values are not z\b",
    ];
    expect(input.steps[0]).toHaveLength(180);
    expect(productGuideReplySchema.safeParse(input).success).toBe(false);
    expect(input.steps[0]).toMatch(/z\u0008$/);
  });
  it("preserves valid Unicode, ordinary whitespace, feature identity and resolved links", () => {
    const input = reply();
    input.text =
      "Care → Purchases & Docs → Insights. Example ≠ Verified Sandbox.\nReview saved evidence.";
    const answer = productGuideAnswer(input);
    expect(answer.text).toBe(input.text);
    expect(answer.steps).toEqual(input.steps);
    expect(answer.sources.map((s) => s.id)).toEqual([
      "palcare-interface-library",
      "palcare-interface-receipts",
    ]);
    expect(answer.actions.map((a) => a.href)).toEqual([
      "/purchases",
      "/documents",
    ]);
  });
  it("retains exact original caps, strict keys and known feature allowlist", () => {
    const input = {
      ...reply(),
      text: "a".repeat(620),
      steps: ["b".repeat(180)],
    };
    expect(productGuideReplySchema.safeParse(input).success).toBe(true);
    expect(
      productGuideReplySchema.safeParse({ ...input, text: input.text + "a" })
        .success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({
        ...input,
        steps: [input.steps[0] + "b"],
      }).success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...input, features: ["send_refund"] })
        .success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...input, authority: "owner" })
        .success,
    ).toBe(false);
  });
});
