import { describe, it, expect } from "vitest";
import { matchRecall, type RecallRule } from "../../src/lib/safety/matching";
import { retrieveCpsc, sourceHash } from "../../src/lib/safety/cpsc";
import {
  referenceSource,
  reviewedModels,
  fictionalOwnership,
} from "../../src/lib/safety/reference";
const rule: RecallRule = {
  brand: "Insignia",
  models: reviewedModels,
  restrictionsReviewed: true,
  requiresSerial: false,
  requiresDate: false,
  sourceUnchanged: true,
};
describe("official recall evidence, not product-name resemblance", () => {
  it("keeps fictional ownership a candidate even when the model is listed", () =>
    expect(matchRecall(fictionalOwnership, rule).state).toBe("possible_match"));
  it("requires exact model/brand and independent identifier verification", () => {
    expect(
      matchRecall({ ...fictionalOwnership, identifiersVerified: true }, rule)
        .state,
    ).toBe("identifiers_match");
    for (const model of ["NS-AF34D2X", "NS-AF34D", "AF34D2"])
      expect(matchRecall({ ...fictionalOwnership, model }, rule).state).toBe(
        "no_match",
      );
    expect(matchRecall({ ...fictionalOwnership, model: "" }, rule).state).toBe(
      "possible_match",
    );
    expect(
      matchRecall({ ...fictionalOwnership, brand: "Forma" }, rule).state,
    ).toBe("no_match");
  });
  it("never confirms serial/date restrictions from mere supplied values or changed source", () => {
    expect(
      matchRecall(
        { ...fictionalOwnership, identifiersVerified: true, serial: "123" },
        { ...rule, requiresSerial: true },
      ).state,
    ).toBe("more_information");
    expect(
      matchRecall(fictionalOwnership, { ...rule, sourceUnchanged: false })
        .state,
    ).toBe("not_assessed");
  });
  it("parses bounded provider data, pins the recall number and rejects unsafe links", async () => {
    const transport = (body: unknown) => async () =>
      new Response(JSON.stringify(body), { status: 200 });
    expect((await retrieveCpsc(transport([referenceSource]))).hash).toBe(
      sourceHash(referenceSource),
    );
    await expect(
      retrieveCpsc(transport([{ ...referenceSource, RecallNumber: "wrong" }])),
    ).rejects.toThrow();
    await expect(
      retrieveCpsc(
        transport([
          { ...referenceSource, URL: "https://evil.example/Recalls/1" },
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      retrieveCpsc(transport([referenceSource, referenceSource])),
    ).rejects.toThrow();
  });
});
