import { describe, expect, it } from "vitest";
import { contextOf, type CareAnswer } from "../../src/lib/careos/contracts";
import { groundedAnswer } from "../../src/lib/careos/grounding";
import { selectedEvidence } from "../../src/lib/careos/evidence-selection";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { demoData } from "../../src/lib/demo/fixtures";

const base: CareAnswer = {
  outcome: "answered",
  mode: "deterministic",
  revision: 2,
  context: contextOf({
    twin: demoData.twins[3],
    product: demoData.products[3],
  }),
  text: "Raspberry Pi 5: fictional Sample ownership, not a verified payment.",
  steps: ["The recorded zero is a reference placeholder, not a free purchase."],
  sources: [],
  actions: [],
};

describe("North real-evaluation rendering regressions (saved outputs only, no provider)", () => {
  it("labels exact-source desktop and button shutdown methods as alternatives, not sequential steps", () => {
    const [, desktop, button] = referenceSource.content.split("\n");
    for (const quotes of [[desktop], [button], [desktop, button]]) {
      const answer = groundedAnswer(
        base,
        {
          outcome: "answered",
          steps: quotes.map((quote) => ({
            sourceId: referenceSource.id,
            quote,
            text: quote,
          })),
        },
        [referenceSource],
      );
      expect(answer.steps).toEqual(quotes);
      expect(
        answer.text.includes("alternative shutdown methods; choose one"),
      ).toBe(quotes.length === 2);
    }
  });
  it("does not imply that an original guide exists when no matching sources were supplied", () => {
    const answer = groundedAnswer(
      base,
      { outcome: "insufficient", steps: [] },
      [],
    );
    expect(answer.outcome).toBe("missing");
    expect(answer.text).toContain("No matching product-care guide");
    expect(answer.text).not.toContain("inspect the original guide");
    expect(answer.steps).toEqual([]);
    expect(answer.sources).toEqual([]);
    expect(answer.actions).toEqual([
      {
        label: "Review saved documents",
        href: `/vault/${base.context!.twinId}#documents-heading`,
      },
    ]);
  });
  it("retains the original-guide path when a supplied guide simply does not cover the question", () => {
    const answer = groundedAnswer(
      base,
      { outcome: "insufficient", steps: [] },
      [referenceSource],
    );
    expect(answer.text).toContain("available documentation does not support");
    expect(answer.actions[0].href).toBe(`/vault/${base.context!.twinId}/care`);
  });
  it("does not offer withdrawn guidance as an available guide or fabricate a null-purchase URL", () => {
    const answer = groundedAnswer(
      { ...base, context: null },
      { outcome: "insufficient", steps: [] },
      [{ ...referenceSource, status: "withdrawn" }],
    );
    expect(answer.text).toContain("No matching product-care guide");
    expect(answer.actions).toEqual([]);
  });
  it("preserves exact dated identity/provenance even when a model selects only the zero-placeholder fact", () => {
    const original = structuredClone(base);
    const answer = selectedEvidence(base, { factIds: ["fact-1"] });
    expect(answer.text).toBe(base.text);
    expect(answer.context).toEqual(base.context);
    expect(answer.context?.purchasedOn).toBe("2026-10-07");
    expect(answer.steps).toEqual(base.steps);
    expect(base).toEqual(original);
  });
});
