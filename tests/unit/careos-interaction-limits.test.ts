import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { contextOf, type TurnInput } from "../../src/lib/careos/contracts";
import {
  libraryQuestionPending,
  questionUsesInsights,
} from "../../src/lib/careos/interaction-limits";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { resolveTurn } from "../../src/lib/careos/service";
import { demoData } from "../../src/lib/demo/fixtures";

const libraryQuestions = [
  "What did I buy in the last three months?",
  "Show my recorded purchase totals.",
  "Find purchases with receipts.",
  "Show all my purchases.",
  "List every purchase.",
  "Show everything I bought.",
  "Find purchases from last month.",
  "Which products have receipts?",
  "Which purchases have product care?",
  "Find all receipts.",
  "How much did I spend?",
  "How much have I spent on electronics?",
  "What are my spending patterns?",
  "What is the total purchase value?",
  "ＳＨＯＷ ＡＬＬ ＰＵＲＣＨＡＳＥＳ",
];
const productQuestions = [
  "Summarize this dated sample purchase, not my entire library.",
  "Find the receipt for this purchase, not all receipts.",
  "Find my headphones receipt.",
  "Show proof of payment for this purchase.",
  "How much did I pay?",
  "How much did I spend on this purchase?",
  "When did I buy this?",
  "When did I buy this and how much did I pay?",
  "Show the manufacturer manual.",
  "How do I shut down my Pi?",
  "How do I clean these?",
  "What is North Star?",
];

describe("1A library honesty guard is not a library-query implementation", () => {
  it("honors explicit correction clauses without treating negated product context as the requested scope", () => {
    expect(
      libraryQuestionPending(
        "How much did I spend last month, not this purchase?",
      ),
    ).toBe(true);
    expect(
      libraryQuestionPending(
        "List all my purchases, not the selected headphones.",
      ),
    ).toBe(true);
  });
  it.each(libraryQuestions)(
    "recognizes unsupported library scope: %s",
    (question) => {
      expect(libraryQuestionPending(question)).toBe(true);
    },
  );

  it.each(productQuestions)(
    "does not intercept a working exact-product task: %s",
    (question) => {
      expect(libraryQuestionPending(question)).toBe(false);
    },
  );

  it.each(["fixture", "disabled", "responses"] as const)(
    "never dispatches a model, loads unrelated evidence or substitutes a selected price in %s mode",
    async (mode) => {
      for (const twinId of [null, demoData.twins[0].id]) {
        for (const message of libraryQuestions) {
          const input: TurnInput = Object.freeze({
            requestId: randomUUID(),
            twinId,
            revision: 17,
            message,
          });
          const before = structuredClone(input);
          const fail = vi.fn(async () => {
            throw new Error(
              "No model or evidence work is permitted for the 1A limitation",
            );
          });
          const answer = await resolveTurn({
            data: demoData,
            input,
            sources: [referenceSource],
            history: [],
            mode,
            model: { classify: fail, explain: fail, selectEvidence: fail },
            call: fail,
            load: {
              knowledge: fail,
              guardian: fail,
              recall: fail,
              activity: fail,
            },
          });
          expect(answer).toMatchObject({
            outcome: "unsupported",
            mode: "deterministic",
            questionScope: "library",
            context: null,
            revision: input.revision,
            sources: [],
            steps: [],
          });
          expect(answer.text).toMatch(/coming|next checkpoint|not yet/i);
          expect(answer.text).not.toMatch(
            /\$\d|USD\s+\d|Saved purchase total:/,
          );
          expect(answer.purchaseChoices).toBeUndefined();
          expect(answer.actions.map((action) => action.href).sort()).toEqual([
            "/insights",
            "/vault",
          ]);
          expect(fail).not.toHaveBeenCalled();
          expect(input).toEqual(before);
          expect(input.requestId).toBe(before.requestId);
          expect(input.twinId).toBe(twinId);
        }
      }
    },
  );

  it("does not let a client intent hint bypass library scope", async () => {
    const fail = vi.fn(async () => {
      throw new Error("Library question must not reach a model");
    });
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: randomUUID(),
        twinId: demoData.twins[0].id,
        revision: 5,
        message: "Show all my purchases.",
        intent: "summary",
      },
      sources: [],
      history: [],
      mode: "responses",
      model: { classify: fail, explain: fail, selectEvidence: fail },
      call: fail,
    });
    expect(answer.questionScope).toBe("library");
    expect(answer.context).toBeNull();
    expect(answer.text).not.toContain("$149.00");
    expect(fail).not.toHaveBeenCalled();
  });

  it.each([
    "Which purchases have product care?",
    "Find purchases with receipts.",
    "How much did I spend?",
  ])(
    "uses the library guard even with the reference example selected: %s",
    async (message) => {
      const fail = vi.fn(async () => {
        throw new Error(
          "A reference example must not substitute recall evidence or dispatch a model for library scope",
        );
      });
      const input: TurnInput = Object.freeze({
        requestId: randomUUID(),
        twinId: null,
        example: "insignia",
        revision: 12,
        message,
        intent: "recall",
      });
      const before = structuredClone(input);
      const answer = await resolveTurn({
        data: demoData,
        input,
        sources: [referenceSource],
        history: [],
        mode: "responses",
        model: { classify: fail, explain: fail, selectEvidence: fail },
        call: fail,
        load: { knowledge: fail, guardian: fail, recall: fail, activity: fail },
      });
      expect(answer).toMatchObject({
        outcome: "unsupported",
        mode: "deterministic",
        questionScope: "library",
        context: null,
        revision: input.revision,
        steps: [],
        sources: [],
      });
      expect(answer.actions.map((action) => action.href).sort()).toEqual([
        "/insights",
        "/vault",
      ]);
      expect(answer.text).not.toMatch(/Insignia|air fryer|\$\d/);
      expect(input).toEqual(before);
      expect(fail).not.toHaveBeenCalled();
    },
  );

  it("still reauthorizes a selected purchase before acknowledging a library limitation", async () => {
    const fail = vi.fn(async () => {
      throw new Error("No provider authority");
    });
    for (const twinId of [randomUUID(), "../../private"]) {
      await expect(
        resolveTurn({
          data: demoData,
          input: {
            requestId: randomUUID(),
            twinId,
            revision: 1,
            message: "Show all my purchases.",
          },
          sources: [],
          history: [],
          mode: "responses",
          model: { classify: fail, explain: fail },
          call: fail,
        }),
      ).rejects.toMatchObject({
        code: "careos_purchase_not_found",
        status: 404,
      });
    }
    expect(fail).not.toHaveBeenCalled();
  });

  it("preserves the exact receipt and selected-price path after a library question", async () => {
    const selected = demoData.twins[0];
    const context = contextOf({
      twin: selected,
      product: demoData.products[0],
    });
    const before = structuredClone(context);
    const fail = vi.fn(async () => {
      throw new Error(
        "These saved-record answers need no model or unrelated evidence",
      );
    });
    const ask = (message: string) =>
      resolveTurn({
        data: demoData,
        input: {
          requestId: randomUUID(),
          twinId: context.twinId,
          revision: 8,
          message,
        },
        sources: [],
        history: [],
        mode: "responses",
        model: { classify: fail, explain: fail, selectEvidence: fail },
        call: fail,
        load: { knowledge: fail, guardian: fail, recall: fail, activity: fail },
      });
    const library = await ask("How much did I spend?");
    expect(library.questionScope).toBe("library");
    const receipt = await ask("Find my receipt.");
    expect(receipt.context).toEqual(context);
    expect(receipt.actions).toEqual([
      { label: "Open receipt", href: `/documents/${demoData.documents[0].id}` },
    ]);
    expect(receipt.sources.map((source) => source.id)).toEqual([
      selected.id,
      demoData.documents[0].id,
    ]);
    for (const question of [
      "How much did I pay?",
      "How much did I spend on this purchase?",
    ]) {
      const amount = await ask(question);
      expect(amount.context).toEqual(context);
      expect(amount.text).toContain("Saved purchase total: $149.00.");
      expect(amount.text).toContain("fictional sample purchase");
      expect(amount.questionScope).not.toBe("library");
    }
    expect(context).toEqual(before);
    expect(library.context).toBeNull();
    expect(fail).not.toHaveBeenCalled();
  });

  it("retains exact-model care and never borrows the Pi guide for headphones", async () => {
    const fail = vi.fn(async () => {
      throw new Error(
        "Fixture and missing-manual paths must not dispatch a model",
      );
    });
    const ask = (twinId: string, message: string) =>
      resolveTurn({
        data: demoData,
        input: { requestId: randomUUID(), twinId, revision: 4, message },
        sources: [referenceSource],
        history: [],
        mode: "fixture",
        model: { classify: fail, explain: fail },
        call: fail,
      });
    const pi = await ask(demoData.twins[3].id, "How do I shut down my Pi?");
    expect(pi.mode).toBe("fixture");
    expect(pi.context?.twinId).toBe(demoData.twins[3].id);
    expect(pi.context?.purchasedOn).toBe(demoData.twins[3].purchasedOn);
    expect(pi.steps.length).toBeGreaterThan(0);
    expect(pi.sources.some((source) => source.id === referenceSource.id)).toBe(
      true,
    );
    const missing = await ask(demoData.twins[0].id, "How do I clean these?");
    expect(missing.outcome).toBe("missing");
    expect(missing.context?.twinId).toBe(demoData.twins[0].id);
    expect(missing.sources.map((source) => source.id)).toEqual([
      demoData.twins[0].id,
    ]);
    expect(missing.steps).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
  });

  it("does not disguise a prohibited financial instruction as a supported library task", async () => {
    const fail = vi.fn(async () => {
      throw new Error("No financial or model authority");
    });
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: randomUUID(),
        twinId: demoData.twins[0].id,
        revision: 1,
        message: "Show all purchases and refund this payment.",
      },
      sources: [],
      history: [],
      mode: "responses",
      model: { classify: fail, explain: fail },
      call: fail,
    });
    expect(answer.outcome).toBe("unsupported");
    expect(answer.text).toContain(
      "cannot make payments, refunds or merchant changes",
    );
    expect(answer.actions).toEqual([]);
    expect(fail).not.toHaveBeenCalled();
  });
});

describe("question routing preserves library scope and explicit product tasks on Insights", () => {
  it.each([
    "Find my PayPal receipt.",
    "Find my verified headphones receipt.",
    "Show my Sandbox receipt.",
    "Show my PayPal invoice.",
    "Show verified proof of payment.",
  ])(
    "routes qualified receipt searches to Insights without substituting a selected sample: %s",
    (message) => {
      expect(questionUsesInsights(message, true)).toBe(true);
      expect(questionUsesInsights(message, false)).toBe(true);
      expect(questionUsesInsights(message, true, true)).toBe(false);
      expect(questionUsesInsights(message, false, true)).toBe(false);
    },
  );

  it.each([
    "Which products have manuals?",
    "Find purchases with receipts.",
    "Find all receipts.",
    "What did I buy in the last three months?",
    "Show my recorded purchase totals.",
    "How much did I spend?",
  ])(
    "uses the 1A care honesty guard instead of the planner for unsupported library questions: %s",
    (message) => {
      expect(questionUsesInsights(message, true)).toBe(false);
      expect(questionUsesInsights(message, false)).toBe(false);
    },
  );

  it.each([
    "Find my receipt.",
    "Find my headphones receipt.",
    "Show the receipt for this purchase.",
    "How much did I spend on this purchase?",
    "How much did I pay?",
    "When did I buy this purchase?",
    "How do I care for this product?",
  ])(
    "keeps an exact-product request on the care transport with a product selected: %s",
    (message) => {
      expect(questionUsesInsights(message, true)).toBe(false);
    },
  );

  it.each([false, true])(
    "honors an explicit product-task override without requiring product context, selected=%s",
    (hasProduct) => {
      for (const message of [
        "Which purchases have product care?",
        "Find all receipts.",
        "Show a category chart.",
      ]) {
        expect(questionUsesInsights(message, hasProduct, true)).toBe(false);
      }
    },
  );

  it("keeps native presentation requests on Insights without overriding a forced product task", () => {
    expect(questionUsesInsights("Show a category chart.", true)).toBe(true);
    expect(questionUsesInsights("Show a category chart.", false)).toBe(true);
  });
  it.each([
    "Which purchases have product care?",
    "Show my purchases by category",
    "Show all purchases",
    "Show my documents",
    "Show verified adjustments",
    "Show all purchases in the dashboard grid",
  ])("preserves existing native presentation routing: %s", (message) => {
    for (const hasProduct of [true, false]) {
      expect(questionUsesInsights(message, hasProduct)).toBe(true);
      expect(questionUsesInsights(message, hasProduct, true)).toBe(false);
    }
  });
});
