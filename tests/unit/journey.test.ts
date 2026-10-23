import { describe, it, expect } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { journeyContext } from "../../src/lib/careos/journey";
import { turnSchema } from "../../src/lib/careos/contracts";
import { resolveTurn } from "../../src/lib/careos/service";
describe("trusted product-aware journey", () => {
  it("derives air-fryer from the explicit example, ignoring conflicting category hints", () => {
    const j = journeyContext(demoData, {
      example: "insignia",
      category: "headphones",
    });
    expect(j?.category).toBe("air-fryer");
    expect(j?.context?.twinId).toBeNull();
    expect(j?.context?.origin).toBe("example");
  });
  it("keeps saved identity and refuses unrelated or malformed contexts", () => {
    const j = journeyContext(demoData, {
      twinId: demoData.twins[0].id,
      category: "air-fryer",
    });
    expect(j?.category).toBe("headphones");
    expect(j?.context?.twinId).toBe(demoData.twins[0].id);
    expect(
      journeyContext(demoData, { twinId: demoData.twins[1].id })?.category,
    ).toBeNull();
    for (const q of [
      { twinId: "wrong" },
      { example: "other" },
      { category: "unknown" },
      { example: "insignia", twinId: demoData.twins[0].id },
    ])
      expect(journeyContext(demoData, q)).toBeNull();
  });
  it("never creates a purchase/receipt for reference ownership or allows mixed scopes", async () => {
    const input = {
      requestId: crypto.randomUUID(),
      twinId: null,
      example: "insignia" as const,
      revision: 1,
      message: "Find receipt",
    };
    expect(
      turnSchema.safeParse({ ...input, twinId: demoData.twins[0].id }).success,
    ).toBe(false);
    const answer = await resolveTurn({
      data: demoData,
      input,
      sources: [],
      history: [],
      mode: "fixture",
    });
    expect(answer.outcome).toBe("missing");
    expect(answer.text).toContain("no Purchase Twin");
    expect(answer.context?.twinId).toBeNull();
    expect(answer.actions.some((a) => a.href.startsWith("/documents/"))).toBe(
      false,
    );
  });
});
