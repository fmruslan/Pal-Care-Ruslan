import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { contextOf, type CareAnswer } from "../../src/lib/careos/contracts";
import { selectedEvidence } from "../../src/lib/careos/evidence-selection";
import { groundedAnswer } from "../../src/lib/careos/grounding";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { resolveTurn } from "../../src/lib/careos/service";
import { CARE_SELECTION_INSTRUCTIONS } from "../../src/lib/careos/providers/responses";
import { demoData } from "../../src/lib/demo/fixtures";
import { north1aCases } from "../fixtures/north-1a-live";
import { north1aAdditionalCases } from "../fixtures/north-1a-additional-live";
import { north1aFollowupCases as corpus } from "../fixtures/north-1a-followup-live";

// Exactly 50 NEW automated cases; none invokes a provider, grants authority,
// changes a frozen rubric or pretends to be browser/recovery acceptance.
const libraryQuestions = [
  "List all my saved purchases in the last three months.",
  "Calculate total recorded value across all saved purchases.",
  "Turn the library purchase results into linked bullet points.",
  "Filter all saved purchases to October 2026, not the selected headphones.",
  "Reformat my library purchase results as bullets.",
  "Export the purchase library as CSV.",
  "Summarize the whole purchase library.",
  "Show my entire library as a linked list.",
  "Group every saved purchase by month.",
  "Find all receipts across my saved purchases.",
  "Find purchases from last month.",
  "Show all my purchases, rather than this purchase.",
  "What have I bought in the past three months?",
  "What did I buy last month?",
  "Find purchases with receipts.",
  "Which purchases have manufacturer manuals?",
  "What is my spending across Audio?",
  "Sum the recorded purchase value.",
  "ＳＨＯＷ ＭＹ ＬＩＢＲＡＲＹ ＡＳ ＢＵＬＬＥＴＳ",
  "Return library purchase results, not the current product.",
];
const bases: CareAnswer[] = demoData.twins.map((twin) => ({
  outcome: "answered",
  mode: "deterministic",
  revision: 7,
  context: contextOf({
    twin,
    product: demoData.products.find((p) => p.id === twin.productId)!,
  }),
  text: `${twin.id}: fictional Sample record; not a verified payment.`,
  steps: [
    twin.id === demoData.twins[3].id
      ? "Zero is a reference placeholder, not free goods or an established purchase price."
      : "Recorded Sample value, not a live payment status.",
    "No live payment/refund check was performed.",
  ],
  sources: [],
  actions: [],
}));

describe("North 1A — 50 additional automated acceptance regressions", () => {
  it.each(libraryQuestions)(
    "library guard is independent of a bad classifier: %s",
    async (message) => {
      const fail = vi.fn(async () => {
        throw new Error(
          "Must not dispatch or retrieve for an unsupported library task",
        );
      });
      const answer = await resolveTurn({
        data: demoData,
        input: {
          requestId: randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 7,
          message,
        },
        mode: "responses",
        model: { classify: fail, explain: fail, selectEvidence: fail },
        call: fail,
        sources: [],
        history: [],
        load: { knowledge: fail, guardian: fail, recall: fail, activity: fail },
      });
      expect(answer).toMatchObject({
        outcome: "unsupported",
        questionScope: "library",
        context: null,
        mode: "deterministic",
        steps: [],
      });
      expect(answer.text).not.toMatch(/\$\d|USD\s+\d/);
      expect(fail).not.toHaveBeenCalled();
    },
  );

  it.each(
    bases.flatMap((base) =>
      [["fact-1"], ["fact-2"], ["fact-2", "fact-1"]].map((factIds) => ({
        name: base.context!.name,
        base,
        factIds,
      })),
    ),
  )(
    "selection $factIds retains $name exact dated identity and uncertainty",
    ({ base, factIds }) => {
      const before = structuredClone(base);
      const answer = selectedEvidence(base, { factIds });
      expect(answer.context).toEqual(before.context);
      expect(answer.text).toBe(before.text);
      expect(answer.steps).toEqual(
        factIds.map((id) => before.steps[Number(id.slice(-1)) - 1]),
      );
      expect(answer.actions).toEqual(before.actions);
      expect(base).toEqual(before);
    },
  );

  it.each(
    bases.flatMap((base) =>
      (["absent", "conflicting", "withdrawn"] as const).map((status) => ({
        name: base.context!.name,
        base,
        status,
      })),
    ),
  )(
    "$status source cannot imply an available original guide for $name",
    ({ base, status }) => {
      const answer = groundedAnswer(
        base,
        { outcome: "insufficient", steps: [] },
        status === "absent" ? [] : [{ ...referenceSource, status }],
      );
      expect(answer).toMatchObject({
        outcome: "missing",
        steps: [],
        context: base.context,
      });
      expect(answer.text).toContain("No matching product-care guide");
      expect(answer.text).not.toContain("inspect the original guide");
      expect(answer.actions).toEqual([
        {
          label: "Review saved documents",
          href: `/vault/${base.context!.twinId}#documents-heading`,
        },
      ]);
    },
  );

  it("fixes one separate 50-case manifest with unique IDs, not another completed batch", () => {
    expect(corpus).toHaveLength(50);
    expect(new Set(corpus.map((c) => c.id)).size).toBe(50);
    expect(corpus.every((c) => c.id.startsWith("followup-"))).toBe(true);
  });
  it("retains all nine exact failed payloads and expectations before new dispatch", () => {
    const originals = [...north1aCases, ...north1aAdditionalCases];
    for (const c of corpus.slice(0, 9)) {
      const id = c.id.replace(/^followup-\d+-/, "");
      const original = originals.find((c) => c.id === id)!;
      expect(c.payload).toBe(original.payload);
      expect(c.expected).toEqual(original.expected);
    }
  });
  it("bounds every new supplied packet without losing its declared question", () => {
    for (const c of corpus) {
      expect(Buffer.byteLength(c.payload)).toBeLessThanOrEqual(14000);
      expect(JSON.parse(c.payload).question).toBe(c.review.goal);
    }
  });
  it("never lends Pi care sources to another model in the new corpus", () => {
    for (const c of corpus.filter((c) => c.method === "explain")) {
      const payload = JSON.parse(c.payload);
      for (const passage of payload.untrustedPassages) {
        expect(payload.product).toEqual({
          brand: referenceSource.brand,
          model: referenceSource.model,
        });
        expect(passage.content).toBe(referenceSource.content);
      }
    }
  });
  it("requires existing supplied IDs, not future results, for every evidence rubric", () => {
    for (const c of corpus.filter((c) => c.method === "selectEvidence")) {
      const facts = JSON.parse(c.payload).facts as { id: string }[];
      for (const id of c.expected.requiredFactIds!) {
        expect(facts.some((f) => f.id === id)).toBe(true);
        expect(c.expected.allowedFactIds).toContain(id);
      }
    }
  });
  it("does not interpret a negative receipt constraint as a positive fact request", () => {
    expect(CARE_SELECTION_INSTRUCTIONS).toContain(
      "does not request an extra receipt/no-receipt fact",
    );
    expect(CARE_SELECTION_INSTRUCTIONS).toContain(
      "independently retains the current dated purchase identity and provenance",
    );
  });
});
