import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  recallExplanation,
  type RecallEvidence,
} from "../../src/lib/safety/evidence";
import {
  referenceSource,
  REVIEWED_SOURCE_HASH,
} from "../../src/lib/safety/reference";
const evidence: RecallEvidence = {
  hash: REVIEWED_SOURCE_HASH,
  title: referenceSource.Title,
  url: referenceSource.URL,
  retrievedAt: "2026-10-23T05:34:34.139Z",
  mode: "bundled_official_snapshot",
  unavailable: false,
};
describe("CareOS aftercare is scoped evidence, never model authority", () => {
  it("does not conflate matching saved model with verified physical recall identity", () => {
    const answer = recallExplanation(
      { brand: "Insignia", model: "NS-AF34D2" },
      evidence,
    );
    expect(answer.text).toContain(
      "physical product identity has not been verified",
    );
    expect(answer.text).toContain("no live source check this turn");
  });
  it("does not certify an unmatched fictional product as safe", () => {
    const answer = recallExplanation(
      { brand: "Forma", model: "F-01" },
      evidence,
    );
    expect(answer.text).toContain("not a safety certification");
    expect(answer.text).toContain("not the complete recall database");
  });
  it("rejects unsafe provenance and treats changed/failed sources explicitly", () => {
    expect(
      recallExplanation(
        { brand: "Forma", model: "F-01" },
        { ...evidence, url: "https://evil.example/" },
      ).evidence,
    ).toBeNull();
    expect(
      recallExplanation(
        { brand: "Insignia", model: "NS-AF34D2" },
        { ...evidence, hash: "0".repeat(64) },
      ).text,
    ).toContain("need review");
    expect(
      recallExplanation(
        { brand: "Forma", model: "F-01" },
        { ...evidence, unavailable: true },
      ).text,
    ).toContain("latest refresh failed");
  });
  it("replacement guidance never swaps a kettle for unrelated headphone profiles", () => {
    const input = {
      requestId: randomUUID(),
      twinId: demoData.twins[1].id,
      revision: 1,
      message: "Find a replacement",
    };
    const a = deterministicAnswer(demoData, input);
    expect(a.outcome).toBe("unsupported");
    expect(a.actions.every((x) => !x.href.includes("replacements"))).toBe(true);
  });
  it("recall reads keep their selected Twin and cite the supplied official source", () => {
    const input = {
      requestId: randomUUID(),
      twinId: demoData.twins[0].id,
      revision: 1,
      message: "Is this recalled?",
    };
    const a = deterministicAnswer(demoData, input, "recall", [], evidence);
    expect(a.context?.twinId).toBe(input.twinId);
    expect(a.sources.at(-1)?.href).toBe(evidence.url);
    expect(a.mode).toBe("deterministic");
  });
});
