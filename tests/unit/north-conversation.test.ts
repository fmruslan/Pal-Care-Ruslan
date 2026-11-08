import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerConversationTurn,
  CONVERSATION_INSTRUCTIONS,
  conversationPlanSchema,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  answerRecordsTurn,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { referenceSource } from "../../src/lib/careos/knowledge";
import type { CareTurn } from "../../src/lib/careos/contracts";

const now = () => new Date("2026-11-03T12:00:00Z");
const input = (message: string) => ({
  message,
  requestId: randomUUID(),
  twinId: null,
  revision: 0,
});
function plan(change: Partial<ConversationPlan> = {}): ConversationPlan {
  const {
    version: _v,
    referenceDate: _d,
    timezone: _z,
    ...query
  } = emptyRecordsQuery("2026-11-03");
  void _v;
  void _d;
  void _z;
  return conversationPlanSchema.parse({
    task: "records",
    relation: "fresh",
    query: { ...query, outcome: "query" },
    comparison: null,
    productSearch: "",
    productAction: "summary",
    careQuestion: "",
    clarification: "",
    ...change,
  });
}
function setup(proposal: ConversationPlan) {
  const interpret = vi.fn(async (payload: string) => {
    void payload;
    return proposal;
  });
  const model = {
    classify: vi.fn(),
    explain: vi.fn(async () => ({
      value: {
        outcome: "answered" as const,
        steps: [
          {
            text: "Use the documented shutdown option.",
            sourceId: referenceSource.id,
            quote:
              "Shutdown. Closes all running programs and powers off your Raspberry Pi.",
          },
        ],
      },
      micro: null,
    })),
  };
  return {
    input: input("hello"),
    history: [] as CareTurn[],
    load: vi.fn(async () => demoData),
    interpret,
    knowledge: vi.fn(async () => [referenceSource]),
    model,
    call: async <T>(work: (signal: AbortSignal) => Promise<{ value: T }>) =>
      (await work(new AbortController().signal)).value,
    now,
  };
}
describe("owned latest-topic projection with injected interpretation", () => {
  async function topicHistory() {
    const careOptions = setup(
      plan({
        task: "care",
        relation: "followup",
        productSearch: "Raspberry Pi 5",
        careQuestion: "Can I unplug the Raspberry Pi 5 right away?",
      }),
    );
    const careTurn: CareTurn = {
      requestId: careOptions.input.requestId,
      message: "Can I unplug it right away?",
      answer: await answerConversationTurn(careOptions),
    };
    const allOptions = setup(plan());
    const allTurn: CareTurn = {
      requestId: allOptions.input.requestId,
      message: "Back to all saved purchases",
      answer: await answerConversationTurn(allOptions),
    };
    const unpricedPlan = plan({ relation: "followup" });
    unpricedPlan.query.price = "missing";
    unpricedPlan.query.format = "bullets";
    const unpricedOptions = setup(unpricedPlan);
    const unpricedTurn: CareTurn = {
      requestId: unpricedOptions.input.requestId,
      message: "Which have no recorded price?",
      answer: await answerConversationTurn(unpricedOptions),
    };
    return { careTurn, allTurn, unpricedTurn, unpricedPlan };
  }

  it("anchors simplification to the latest actual unpriced result instead of an older care question or stale plan", async () => {
    const { careTurn, allTurn, unpricedTurn, unpricedPlan } =
      await topicHistory();
    // A derived plan must not outrank the actual application-owned result.
    unpricedTurn.answer = {
      ...unpricedTurn.answer,
      conversationPlan: careTurn.answer.conversationPlan,
    };
    const options = setup({ ...unpricedPlan, productAction: "explain" });
    options.history = [careTurn, allTurn, unpricedTurn];
    const originalHistory = JSON.stringify(options.history);
    const message = "Explain that more simply";
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input(message),
        followupRequestId: unpricedTurn.requestId,
      },
    });
    const payload = JSON.parse(options.interpret.mock.calls[0][0]);
    expect(payload.question).toBe(message);
    expect(payload.currentTopic).toMatchObject({
      question: unpricedTurn.message,
      answer: unpricedTurn.answer.text,
      task: "records",
      questionScope: "library",
      context: null,
      careQuestion: "",
      recordsResult: {
        query: unpricedTurn.answer.recordsResult!.query,
        comparison: null,
        recordIndexes: [0],
        recordCount: 1,
        complete: true,
      },
    });
    expect(payload.facts[0]).toEqual({
      name: "Raspberry Pi 5",
      model: "5",
      category: "Computing",
      purchasedOn: "2026-10-07",
      origin: "sample",
      amountMinor: null,
    });
    expect(
      payload.history.map((turn: { question: string }) => turn.question),
    ).toEqual(options.history.map((turn) => turn.message));
    expect(
      payload.history.every((turn: object) => !Object.hasOwn(turn, "plan")),
    ).toBe(true);
    expect(payload.coverage.derivedHistoricalPlans).toBe("omitted");
    expect(JSON.stringify(options.history)).toBe(originalHistory);
    expect(answer.recordsResult?.query.price).toBe("missing");
    expect(answer.text).not.toBe(unpricedTurn.answer.text);
    expect(answer.text).toContain(
      "Raspberry Pi 5 has no recorded purchase price",
    );
    expect(answer.text).toContain("unknown, not zero or free");
    expect(answer.text).toContain("left out of spending totals");
    expect(answer.steps).toHaveLength(1);
    expect(answer.recordsResult?.records.map((record) => record.id)).toEqual([
      "00000000-0000-4000-8000-000000000204",
    ]);
    expect(options.knowledge).not.toHaveBeenCalled();
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it("bounds current-topic server facts to twelve rows without exposing record IDs", async () => {
    const data = {
      ...demoData,
      twins: Array.from({ length: 13 }, () => ({
        ...demoData.twins[0],
        id: randomUUID(),
      })),
      documents: [],
      events: [],
    };
    const originalInput = input("Show all my saved purchases");
    const answer = await answerRecordsTurn({
      input: originalInput,
      history: [],
      load: async () => data,
      now,
    });
    const options = setup(plan({ relation: "followup" }));
    options.history = [
      {
        requestId: originalInput.requestId,
        message: originalInput.message,
        answer,
      },
    ];
    await answerConversationTurn({
      ...options,
      input: input("Explain that result"),
    });
    const payload = JSON.parse(options.interpret.mock.calls[0][0]);
    expect(answer.recordsResult?.records).toHaveLength(13);
    expect(payload.currentTopic.recordsResult.recordIndexes).toHaveLength(12);
    expect(payload.currentTopic.recordsResult.recordCount).toBe(13);
    expect(payload.currentTopic.recordsResult.complete).toBe(false);
    for (const record of payload.facts) {
      expect(Object.keys(record).sort()).toEqual([
        "amountMinor",
        "category",
        "model",
        "name",
        "origin",
        "purchasedOn",
      ]);
      expect(record.amountMinor).toBe(14900);
    }
    expect(payload.currentTopic.context).toBeNull();
    for (const twin of data.twins)
      expect(JSON.stringify(payload.currentTopic)).not.toContain(twin.id);
  });

  it("preserves explicit product care after an intervening library result", async () => {
    const { careTurn, allTurn, unpricedTurn } = await topicHistory();
    const options = setup(
      plan({
        task: "care",
        relation: "followup",
        productSearch: "Raspberry Pi 5",
        careQuestion: "How do I shut down my Raspberry Pi 5?",
      }),
    );
    options.history = [careTurn, allTurn, unpricedTurn];
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input("How do I shut it down?"),
        followupRequestId: unpricedTurn.requestId,
      },
    });
    const payload = JSON.parse(options.interpret.mock.calls[0][0]);
    expect(payload.question).toBe("How do I shut it down?");
    expect(payload.currentTopic.task).toBe("records");
    expect(payload.currentTopic.careQuestion).toBe("");
    expect(answer.context?.twinId).toBe("00000000-0000-4000-8000-000000000204");
    expect(answer.sources[0].id).toBe(referenceSource.id);
    expect(options.model.explain).toHaveBeenCalledOnce();
  });

  it("derives the records topic from the owned anchor and excludes later care turns", async () => {
    const { careTurn, allTurn, unpricedTurn, unpricedPlan } =
      await topicHistory();
    const options = setup(unpricedPlan);
    options.history = [
      careTurn,
      allTurn,
      unpricedTurn,
      {
        ...careTurn,
        requestId: randomUUID(),
        message: "Later product-care question outside the selected anchor",
      },
    ];
    const originalHistory = JSON.stringify(options.history);
    await answerConversationTurn({
      ...options,
      input: {
        ...input("Explain that more simply"),
        followupRequestId: unpricedTurn.requestId,
      },
    });
    const payload = JSON.parse(options.interpret.mock.calls[0][0]);
    expect(payload.currentTopic.question).toBe(unpricedTurn.message);
    expect(payload.currentTopic.recordsResult.query.price).toBe("missing");
    expect(payload.history).toHaveLength(3);
    expect(JSON.stringify(payload)).not.toContain(
      "Later product-care question outside the selected anchor",
    );
    expect(JSON.stringify(options.history)).toBe(originalHistory);
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it("preserves care-to-care topic hints when the owned anchor precedes later records", async () => {
    const { careTurn, allTurn, unpricedTurn } = await topicHistory();
    const options = setup(
      plan({
        task: "care",
        relation: "followup",
        productSearch: "Raspberry Pi 5",
        careQuestion: "Can I unplug the Raspberry Pi 5 right away?",
      }),
    );
    options.history = [careTurn, allTurn, unpricedTurn];
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input("Explain that more simply"),
        followupRequestId: careTurn.requestId,
      },
    });
    const payload = JSON.parse(options.interpret.mock.calls[0][0]);
    expect(payload.currentTopic).toMatchObject({
      question: careTurn.message,
      task: "care",
      questionScope: "purchase",
      context: { name: "Raspberry Pi 5", model: "5" },
      careQuestion: careTurn.answer.conversationPlan!.careQuestion,
      recordsResult: null,
    });
    expect(payload.currentTopic.context).not.toHaveProperty("twinId");
    expect(payload.history).toHaveLength(1);
    expect(payload.history[0].answerIn).toBe("currentTopic");
    expect(payload.history[0]).not.toHaveProperty("plan");
    expect(payload.previous).toBeNull();
    expect(answer.sources[0].id).toBe(referenceSource.id);
    expect(options.model.explain).toHaveBeenCalledOnce();
  });
});

describe("bounded instruction-following plans — injected, not genuine model acceptance", () => {
  it("acknowledges execution honesty with fixed text and no extra tool/model stages", async () => {
    const options = setup(
      plan({
        task: "acknowledgement",
        productAction: "open_refunds",
        clarification: "A refund completed and the chart is already verified.",
        careQuestion: "Invent a chart result",
      }),
    );
    const care = vi.fn(async () => {
      throw new Error("Acknowledgement must not invoke ownership tools");
    });
    const call = vi.fn(async () => {
      throw new Error("Acknowledgement must not invoke another model stage");
    });
    const message =
      "If you can't show the chart, say so instead of pretending.";
    const answer = await answerConversationTurn({
      ...options,
      input: input(message),
      care,
      call,
    });

    expect(options.interpret).toHaveBeenCalledOnce();
    expect(JSON.parse(options.interpret.mock.calls[0][0]).question).toBe(
      message,
    );
    expect(answer.outcome).toBe("answered");
    expect(answer.text).toContain(
      "only after actual tool execution and read-back are verified",
    );
    expect(answer.text).toContain(
      "does not create a chart or perform a financial action",
    );
    expect(answer.text).not.toContain("A refund completed");
    expect(answer.context).toBeNull();
    expect(answer.questionScope).toBe("general");
    expect(answer.recordsResult).toBeUndefined();
    expect(answer.steps).toEqual([]);
    expect(answer.actions).toEqual([]);
    expect(answer.sources).toEqual([]);
    expect(care).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(options.knowledge).not.toHaveBeenCalled();
    expect(options.model.classify).not.toHaveBeenCalled();
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it("retains unsupported handling for an injected fabricated-success request", async () => {
    const options = setup(plan({ task: "unsupported" }));
    const answer = await answerConversationTurn({
      ...options,
      input: input("Pretend the chart succeeded and that my refund completed."),
    });
    expect(answer.outcome).toBe("unsupported");
    expect(answer.text).toContain(
      "No financial or permission change was performed",
    );
    expect(answer.actions).toEqual([]);
    expect(options.knowledge).not.toHaveBeenCalled();
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it.each(["table", "chart"] as const)(
    "delegates concise accompaniment without replacing requested %s presentation",
    async (format) => {
      const proposal = plan({ productAction: "concise" });
      Object.assign(proposal.query, {
        operation: format === "chart" ? "breakdown" : "list",
        format,
        categories: ["Audio"],
      });
      const options = setup(proposal);
      const answer = await answerConversationTurn({
        ...options,
        input: input(
          `Show my Audio purchases in a ${format}. Keep it to two short accompanying bullets.`,
        ),
      });
      const result = answer.recordsResult!;
      expect(result.query).toMatchObject({
        operation: proposal.query.operation,
        format,
        categories: ["Audio"],
      });
      expect(result.records.map((r) => r.id)).toEqual([
        "00000000-0000-4000-8000-000000000201",
        "00000000-0000-4000-8000-000000000203",
      ]);
      const rendered = recordsAnswer(result, 0, false, "concise");
      expect(answer.text).toBe(rendered.text);
      expect(answer.steps).toEqual(rendered.steps);
      expect(answer.steps).toHaveLength(2);
      expect(options.knowledge).not.toHaveBeenCalled();
      expect(options.model.explain).not.toHaveBeenCalled();
    },
  );

  it("delegates scope-first ordering while preserving the unpriced-record selection", async () => {
    const proposal = plan({ productAction: "scope-first" });
    Object.assign(proposal.query, { price: "missing", format: "bullets" });
    const options = setup(proposal);
    const answer = await answerConversationTurn({
      ...options,
      input: input(
        "Which saved products have no recorded price? First state the scope, then the result.",
      ),
    });
    const result = answer.recordsResult!;
    const rendered = recordsAnswer(result, 0, false, "scope-first");
    expect(answer.text).toBe(rendered.text);
    expect(answer.steps).toEqual(rendered.steps);
    expect(answer.text).not.toBe(recordsAnswer(result, 0).text);
    expect(result.records.map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000204",
    ]);
    expect(result.records[0].amountMinor).toBeNull();
  });

  it("handles an injected fresh simpler-explanation plan without inheriting stale filters", async () => {
    const proposal = plan({ productAction: "explain" });
    proposal.query.categories = ["Audio"];
    const options = setup(proposal);
    const priorPlan = plan();
    priorPlan.query.categories = ["Kitchen"];
    const priorOptions = setup(priorPlan);
    options.history = [
      {
        requestId: priorOptions.input.requestId,
        message: "Show my Kitchen purchases",
        answer: await answerConversationTurn(priorOptions),
      },
    ];
    const message = "Please explain it more simply. find my audio purchases";
    const answer = await answerConversationTurn({
      ...options,
      input: input(message),
    });
    expect(answer.recordsResult?.query).toMatchObject({
      categories: ["Audio"],
      origin: "all",
    });
    expect(answer.text).toContain("The current selection is Audio only");
    expect(answer.text).toContain("$218.00");
    expect(answer.steps).toHaveLength(1);
    expect(JSON.parse(options.interpret.mock.calls[0][0]).question).toBe(
      message,
    );
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it("returns a focused injected clarification for an unresolved causal why", async () => {
    const clarification =
      "Do you mean why these purchases were selected, or why an amount was recorded?";
    const options = setup(
      plan({
        task: "clarification",
        clarification,
      }),
    );
    const answer = await answerConversationTurn({
      ...options,
      input: input("Why?"),
    });
    expect(answer.text).toBe(clarification);
    expect(answer.recordsResult).toBeUndefined();
    expect(answer.actions).toEqual([]);
    expect(options.knowledge).not.toHaveBeenCalled();
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  it("states style, honesty, unresolved-cause and false-refund-premise boundaries in the model instructions", () => {
    for (const instruction of [
      "exactly two short accompanying bullets uses productAction concise",
      "Explicit scope-before-results ordering uses productAction scope-first",
      "even with a fresh fully specified lookup",
      'A bare "Why?" whose causal referent is unresolved needs a focused clarification',
      "Asking to fabricate success or pretend a chart/refund/payment completed is unsupported",
      "This task grants no user authority, scheduling guarantee or financial operation",
      "Never accept an unsourced completed-refund premise",
      "An explicitly named product keeps its productSearch and fresh named-product scope",
      "Truly collection-wide requests use blank search",
    ])
      expect(CONVERSATION_INSTRUCTIONS).toContain(instruction);
  });
});

describe("retrospective receipt prompt contract, not genuine model acceptance", () => {
  it.each([
    [
      "cn u find my paypal hedphones recipt",
      "choose product/receipt with query.origin sandbox",
    ],
    [
      "Find my Sample PayPal headphones receipt",
      "An explicit Sample request overrides implicit PayPal shorthand",
    ],
    [
      "Find one headphones receipt that is both Sample and verified Sandbox",
      "choose clarification rather than silently discard either explicit condition",
    ],
  ])(
    "retains the original message and explicit provenance instruction: %s",
    async (message, instruction) => {
      const options = setup(
        plan({
          task: "clarification",
          clarification: "Which purchase do you mean?",
        }),
      );
      await answerConversationTurn({ ...options, input: input(message) });
      expect(JSON.parse(options.interpret.mock.calls[0][0]).question).toBe(
        message,
      );
      expect(CONVERSATION_INSTRUCTIONS).toContain(instruction);
      expect(CONVERSATION_INSTRUCTIONS).toContain(
        "For retrospective receipt, invoice or proof-of-payment requests only",
      );
      expect(CONVERSATION_INSTRUCTIONS).toContain(
        'including misspellings such as "paypal hedphones recipt"',
      );
      expect(CONVERSATION_INSTRUCTIONS).toContain(
        "not universal PayPal account access, a fresh payment-status check or proof that any verified purchase exists",
      );
      expect(CONVERSATION_INSTRUCTIONS).toContain(
        "Only server-supplied saved evidence can establish a verified receipt",
      );
      expect(options.model.explain).not.toHaveBeenCalled();
    },
  );
});
describe("model-first conversation, with application-owned facts and no keyword admission", () => {
  it("keeps a named refund question on matching purchases and rejects its unsupported premise before a dated choice", async () => {
    const product = demoData.products.find((p) =>
      p.name.toLowerCase().includes("headphones"),
    )!;
    const twin = demoData.twins.find((t) => t.productId === product.id)!;
    const options = setup(
      plan({
        task: "aftercare",
        productAction: "refunds",
        productSearch: "Forma headphones",
      }),
    );
    options.load.mockResolvedValue({
      ...demoData,
      twins: [...demoData.twins, { ...twin, id: randomUUID() }],
    });
    const care = vi.fn();
    const answer = await answerConversationTurn({
      ...options,
      input: input(
        "Why did you refund all my purchases yesterday? This is about my headphones.",
      ),
      care,
    });
    expect(answer.text).toContain("haven't established that a refund occurred");
    expect(answer.purchaseChoices).toHaveLength(2);
    expect(
      answer.purchaseChoices!.every(
        (choice) => choice.context.name === product.name,
      ),
    ).toBe(true);
    expect(answer.context).toBeNull();
    expect(care).not.toHaveBeenCalled();
    expect(options.model.explain).not.toHaveBeenCalled();
  });
  it.each([
    "show me all my purches and how much I spent",
    "all the stuff i got, total it pls",
    "my things — what'd they cost?",
    "what did I pay for my purchases?",
    "send me the receipt for the sample headphones please",
  ])(
    "dispatches interpretation for messy ordinary language: %s",
    async (message) => {
      const proposal = plan();
      proposal.query.operation = "total";
      proposal.query.format = "bullets";
      const options = setup(proposal);
      const answer = await answerConversationTurn({
        ...options,
        input: input(message),
      });
      expect(options.interpret).toHaveBeenCalledOnce();
      expect(answer.mode).toBe("live");
      expect(answer.recordsResult?.records).toHaveLength(4);
      expect(answer.recordsResult?.totals[0].amountMinor).toBe(30700);
      expect(answer.recordsResult?.totals[1].amountMinor).toBe(0);
      expect(answer.recordsResult?.totals[0].excludedCount).toBe(1);
    },
  );
  it("counts a rolling three calendar months with exact dates, not residual product words", async () => {
    const proposal = plan();
    Object.assign(proposal.query, {
      operation: "total",
      from: "2026-08-03",
      to: "2026-11-03",
    });
    const answer = await answerConversationTurn({
      ...setup(proposal),
      input: input("how many purchases do i have in the last three months"),
    });
    expect(answer.text).toContain("4 matching saved purchases");
    expect(answer.text).toContain("2026-08-03 through 2026-11-03");
    expect(answer.recordsResult?.query.search).toBe("");
  });
  it("warranty spelling/topic maps to evidence gaps, not made-up dates or a product error", async () => {
    const answer = await answerConversationTurn({
      ...setup(plan({ task: "warranty" })),
      input: input("what products have warrantys expiring"),
    });
    expect(answer.text).toContain("No verified warranty-expiration dates");
    expect(answer.text).toContain(
      "not a list of confirmed expiring warranties",
    );
    expect(answer.recordsResult?.records).toHaveLength(4);
  });
  it("a warranty follow-up stays on the selected dated purchase without inventing an expiry", async () => {
    const options = setup(plan({ task: "warranty", relation: "selected" }));
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input("Does that mean the warranty has run out?"),
        twinId: "00000000-0000-4000-8000-000000000201",
      },
    });
    expect(answer.recordsResult?.records.map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000201",
    ]);
    expect(answer.text).toContain("No verified warranty-expiration dates");
  });
  it("follow-ups have owned query/context evidence and formatting, not visitor-supplied history", async () => {
    const firstOptions = setup(plan());
    const first = await answerConversationTurn(firstOptions);
    const proposal = plan({ relation: "followup" });
    proposal.query.receipt = "present";
    proposal.query.format = "bullets";
    const next = setup(proposal);
    next.history = [
      {
        requestId: firstOptions.input.requestId,
        message: "my purchases",
        answer: first,
      },
    ];
    const answer = await answerConversationTurn({
      ...next,
      input: input("which of those have receipts?"),
    });
    expect(answer.recordsResult?.records.map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000201",
      "00000000-0000-4000-8000-000000000202",
    ]);
    expect(
      JSON.parse(next.interpret.mock.calls[0][0]).previous.recordIndexes,
    ).toHaveLength(4);
  });
  it("this-month versus last-month uses a full previous calendar month, not a three-day implicit period", async () => {
    const proposal = plan({
      comparison: { from: "2026-10-01", to: "2026-10-31" },
    });
    Object.assign(proposal.query, {
      operation: "compare",
      from: "2026-11-01",
      to: "2026-11-03",
    });
    const answer = await answerConversationTurn({
      ...setup(proposal),
      input: input("compare this month with last month"),
    });
    expect(answer.recordsResult?.records).toHaveLength(0);
    expect(answer.recordsResult?.comparison?.records).toHaveLength(4);
    expect(answer.recordsResult?.comparison?.totals[0].amountMinor).toBe(30700);
  });
  it("resolves a unique product for source-grounded care without unnecessary selection", async () => {
    const options = setup(
      plan({
        task: "care",
        productSearch: "raspberry pi",
        careQuestion: "How do I shut down my Raspberry Pi 5?",
      }),
    );
    const answer = await answerConversationTurn({
      ...options,
      input: input("turn my pi off safely pls"),
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.context?.model).toBe("5");
    expect(answer.steps.join(" ")).toContain("Shutdown");
    expect(answer.sources[0].id).toBe(referenceSource.id);
    expect(options.model.explain).toHaveBeenCalledOnce();
  });
  it("a vague care follow-up uses the recent product reply, not an older empty library comparison", async () => {
    const comparison = plan({
      comparison: { from: "2026-10-01", to: "2026-10-31" },
    });
    Object.assign(comparison.query, {
      operation: "compare",
      from: "2026-11-01",
      to: "2026-11-03",
    });
    const empty = await answerConversationTurn(setup(comparison));
    const care = await answerConversationTurn(
      setup(
        plan({
          task: "care",
          productSearch: "Raspberry Pi 5",
          careQuestion: "shutdown",
        }),
      ),
    );
    const options = setup(
      plan({
        task: "care",
        relation: "followup",
        productSearch: "Raspberry Pi 5",
        careQuestion: "can I just unplug it",
      }),
    );
    options.history = [
      {
        requestId: randomUUID(),
        message: "compare this month with last month",
        answer: empty,
      },
      {
        requestId: randomUUID(),
        message: "how do i turn my pi off safely?",
        answer: care,
      },
    ];
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input("can i just unplug it?"),
        twinId: "00000000-0000-4000-8000-000000000204",
      },
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.context?.twinId).toBe("00000000-0000-4000-8000-000000000204");
    expect(options.model.explain).toHaveBeenCalledOnce();
  });
  it("a dated/sample product request applies those identity filters instead of asking for a redundant choice", async () => {
    const proposal = plan({
      task: "product",
      productSearch: "headphones",
      productAction: "receipt",
    });
    Object.assign(proposal.query, {
      origin: "sample",
      from: "2026-10-18",
      to: "2026-10-18",
    });
    const answer = await answerConversationTurn({
      ...setup(proposal),
      input: input("the sample headphones from October 18 please"),
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.context?.twinId).toBe("00000000-0000-4000-8000-000000000201");
    expect(answer.sources.some((s) => s.href.startsWith("/documents/"))).toBe(
      true,
    );
  });
  it("reports a missing sample headphones manual while retaining its existing receipt and dated scope", async () => {
    const proposal = plan({
      task: "product",
      productSearch: "headphones",
      productAction: "manual",
    });
    Object.assign(proposal.query, {
      origin: "sample",
      from: "2026-10-18",
      to: "2026-10-18",
    });
    const options = setup(proposal);
    const answer = await answerConversationTurn({
      ...options,
      input: {
        ...input(
          "Find the manufacturer manual for my sample headphones from October 18",
        ),
        revision: 3,
      },
    });
    expect(answer.outcome).toBe("missing");
    expect(answer.mode).toBe("live");
    expect(answer.revision).toBe(3);
    expect(answer.questionScope).toBe("purchase");
    expect(answer.context).toMatchObject({
      twinId: "00000000-0000-4000-8000-000000000201",
      purchasedOn: "2026-10-18",
      origin: "sample",
    });
    expect(answer.conversationPlan).toEqual(proposal);
    expect(answer.text).toContain(
      "No manufacturer manual is available for Forma F-01",
    );
    expect(answer.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000201",
          href: "/vault/00000000-0000-4000-8000-000000000201",
        }),
        expect.objectContaining({
          id: "00000000-0000-4000-8000-000000000301",
          href: "/documents/00000000-0000-4000-8000-000000000301",
        }),
      ]),
    );
    expect(answer.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/documents/00000000-0000-4000-8000-000000000301",
        }),
        {
          label: "Review saved documents",
          href: "/vault/00000000-0000-4000-8000-000000000201#documents-heading",
        },
      ]),
    );
    expect(answer.actions.some((action) => action.href.endsWith("/care"))).toBe(
      false,
    );
    expect(options.model.explain).not.toHaveBeenCalled();
  });
  it("answers a manual request from approved exact-model guidance even without saved documents", async () => {
    const options = setup(
      plan({
        task: "product",
        productSearch: "Raspberry Pi 5",
        productAction: "manual",
      }),
    );
    options.load.mockResolvedValueOnce({
      ...demoData,
      documents: demoData.documents.filter(
        (d) => d.twinId !== "00000000-0000-4000-8000-000000000204",
      ),
    });
    const answer = await answerConversationTurn({
      ...options,
      input: input("Find the manufacturer guidance for my Raspberry Pi 5"),
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.context?.twinId).toBe("00000000-0000-4000-8000-000000000204");
    expect(answer.text).toContain(
      "Matched official product guidance is available",
    );
    expect(answer.actions).toContainEqual({
      label: "Open official-source product guidance",
      href: "/vault/00000000-0000-4000-8000-000000000204/care",
    });
    expect(answer.sources.map((source) => source.href)).toEqual([
      "/vault/00000000-0000-4000-8000-000000000204",
    ]);
    expect(options.model.explain).not.toHaveBeenCalled();
  });
  it.each(["conflicting", "withdrawn"] as const)(
    "does not treat %s exact-model guidance as an available manual",
    async (status) => {
      const options = setup(
        plan({
          task: "product",
          productSearch: "Raspberry Pi 5",
          productAction: "manual",
        }),
      );
      options.knowledge.mockResolvedValueOnce([{ ...referenceSource, status }]);
      const answer = await answerConversationTurn({
        ...options,
        input: input("Find the manufacturer guidance for my Raspberry Pi 5"),
      });
      expect(answer.outcome).toBe("missing");
      expect(answer.text).toContain("No manufacturer manual is available");
      expect(answer.context?.twinId).toBe(
        "00000000-0000-4000-8000-000000000204",
      );
      expect(options.model.explain).not.toHaveBeenCalled();
    },
  );
  it("model proposals cannot introduce money, record IDs, URLs or executable authority", async () => {
    const options = setup(plan());
    options.interpret.mockResolvedValueOnce({
      ...plan(),
      amountMinor: 1,
    } as never);
    await expect(answerConversationTurn(options)).rejects.toThrow();
    const bad = plan({
      task: "product",
      productSearch: "https://evil.example",
    });
    await expect(answerConversationTurn(setup(bad))).rejects.toThrow();
  });
  it.each([
    "show me all my purches and how much I spent",
    "how many purchases do i have in the last three months",
    "what products have warrantys expiring",
  ])(
    "limited provider-free fallback is useful for the exact reported question: %s",
    async (message) => {
      const answer = await answerRecordsTurn({
        input: input(message),
        history: [],
        load: async () => demoData,
        now,
      });
      expect(answer.mode).toBe("deterministic");
      expect(answer.recordsResult?.records).toHaveLength(4);
      expect(answer.outcome).not.toBe("selection");
      expect(answer.text).not.toContain("product or supported filter");
    },
  );
});
