import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerConversationTurn,
  CONVERSATION_INSTRUCTIONS,
  conversationPlanSchema,
  conversationModelPlanSchema,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  answerRecordsTurn,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { referenceSource } from "../../src/lib/careos/knowledge";
import {
  CareError,
  turnSchema,
  type CareTurn,
} from "../../src/lib/careos/contracts";
import { MemoryStore } from "../../src/lib/careos/store";
import { malformedGuideSteps } from "../fixtures/product-guide-prose";
import type { Explanation } from "../../src/lib/careos/providers/responses";
import { withTenProductFixtures } from "../../src/lib/care/demo/catalog";
import { querySavedRecords } from "../../src/lib/careos/records/service";
import {
  verifiedReceiptRequest,
  prohibitsChartExecution,
} from "../../src/lib/careos/interaction-limits";
import { recordsTaskCandidate } from "../../src/lib/careos/records/query";
import {
  productGuide,
  productGuideAnswer,
  productGuideReplySchema,
} from "../../src/lib/careos/product-guide";

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

describe("current-interface guidance — injected model selection, not genuine acceptance", () => {
  it("requires complete bounded guide text without prohibited controls", () => {
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "Complete concise text, 1–5 steps, 1–3 features; same caps",
    );
    expect(CONVERSATION_INSTRUCTIONS).toContain("no controls/backspace");
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "Prefer 2–3 short steps (~80–140 chars), overview 160–400: soft targets",
    );
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "Guidance followups/simplification use currentTopic guide, not old care/records",
    );
  });
  const guide = {
    text: "Start with Care, find saved evidence in Purchases & Docs, then explore Insights.",
    steps: [
      "Open Care for saved dates and next steps.",
      "Open Purchases & Docs for the dated product and original receipt.",
      "Open Insights for personal charts, grids and evidence.",
    ],
    features: ["overview", "library", "insights"] as const,
  };
  it.each([
    "I'm new. What should I do first?",
    "I'm new here. Walk me through where to start and how North can help.",
    "How do PayPal, North and AG Studio fit together?",
    "How do I show a chart without asking North to execute one?",
    "what is pla care",
    "what is palcare?",
    "how to use insights",
    "how do i use insigths?",
    "What can this app do for me?",
    "Where do I start if I just opened this app?",
    "Explain Insights filters without changing the current chart.",
  ])(
    "renders a bounded practical guide without records/care/native execution: %s",
    async (message) => {
      const proposal = plan({
        task: "guidance",
        guide: { ...guide, features: [...guide.features] },
      });
      const options = setup(proposal);
      const answer = await answerConversationTurn({
        ...options,
        input: input(message),
      });
      expect(answer).toMatchObject({
        outcome: "answered",
        mode: "live",
        text: guide.text,
        steps: guide.steps,
        questionScope: "general",
        context: null,
      });
      expect(answer.recordsResult).toBeUndefined();
      expect(answer.customerPresentation).toBeUndefined();
      expect(answer.actions.map((a) => a.href)).toEqual([
        "/dashboard",
        "/purchases",
        "/insights",
      ]);
      expect(
        answer.sources.every((s) =>
          s.label.includes("not purchase or manufacturer evidence"),
        ),
      ).toBe(true);
      expect(options.knowledge).not.toHaveBeenCalled();
      expect(options.model.explain).not.toHaveBeenCalled();
      expect(options.interpret).toHaveBeenCalledOnce();
      const payload = JSON.parse(options.interpret.mock.calls[0][0]);
      expect(payload.question).toBe(message);
      expect(payload.interfaceGuide.overview).toBe(productGuide.overview.facts);
      expect(payload.interfaceGuide.overview).toContain(
        "saved purchases, receipts, source-backed aftercare",
      );
      expect(payload.interfaceGuide.north).toBe(productGuide.north.facts);
      expect(payload.interfaceGuide.north).toContain(
        "Explore with North / corner star",
      );
    },
  );
  it("asks the model to understand app-help misspellings without rewriting input or granting execution", () => {
    expect(CONVERSATION_INSTRUCTIONS).toContain('"what is pla care"');
    expect(CONVERSATION_INSTRUCTIONS).toContain('"how to use insights"');
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "guidance = Pal Care help from interfaceGuide",
    );
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "Current question stays unchanged",
    );
    expect(CONVERSATION_INSTRUCTIONS).toContain(
      "HOW = guidance; DO/SHOW chart = records + verified native execution",
    );
  });
  it("anchors a guidance follow-up to its own steps/features, excluding later care and retaining old results", async () => {
    const old = plan();
    expect(Object.hasOwn(old, "guide")).toBe(false);
    const guided = plan({
      task: "guidance",
      guide: { ...guide, features: [...guide.features] },
    });
    const options = setup(guided);
    const answer = await answerConversationTurn(options);
    const historicalGuide = {
      ...guide,
      features: [...guide.features],
      steps: malformedGuideSteps.map(({ text }) => text),
    };
    const historicalAnswer = {
      ...answer,
      steps: historicalGuide.steps,
      conversationPlan: plan({ task: "guidance", guide: historicalGuide }),
    };
    expect(
      conversationModelPlanSchema.safeParse(historicalAnswer.conversationPlan)
        .success,
    ).toBe(false);
    const history: CareTurn[] = [
      {
        requestId: randomUUID(),
        message: "Show all purchases",
        answer: {
          ...recordsAnswer(
            querySavedRecords(demoData, emptyRecordsQuery("2026-11-03")),
            0,
          ),
          conversationPlan: old,
        },
      },
      {
        requestId: randomUUID(),
        message: "How do I use this?",
        answer: historicalAnswer,
      },
      {
        requestId: randomUUID(),
        message: "How do I shut down my Pi?",
        answer: {
          ...answer,
          conversationPlan: plan({ task: "care", careQuestion: "Shutdown Pi" }),
        },
      },
    ];
    const before = JSON.stringify(history);
    await answerConversationTurn({
      ...options,
      history,
      input: {
        ...input("Explain that simply"),
        followupRequestId: history[1].requestId,
      },
    });
    const payload = JSON.parse(options.interpret.mock.calls.at(-1)![0]);
    expect(payload.currentTopic).toMatchObject({
      task: "guidance",
      guide: { steps: historicalGuide.steps, features: [...guide.features] },
      recordsResult: null,
      careQuestion: "",
    });
    expect(
      payload.history.map((v: { question: string }) => v.question),
    ).toEqual(history.slice(0, 2).map((v) => v.message));
    expect(JSON.stringify(history)).toBe(before);
    expect(conversationPlanSchema.parse(old)).toEqual(old);
    expect(conversationModelPlanSchema.safeParse(old).success).toBe(false);
    expect(
      conversationModelPlanSchema.parse({ ...old, guide: null }),
    ).toMatchObject({ guide: null });
  });
  it("preserves malformed MemoryStore guides and legacy request identity; not HTTP/database acceptance", async () => {
    const store = new MemoryStore();
    const conversation = await store.create("guide-history-unit");
    const request = turnSchema.parse(input("Where do I start?"));
    const before = JSON.stringify(request);
    const historicalGuide = {
      ...guide,
      features: [...guide.features],
      steps: malformedGuideSteps.map(({ text }) => text),
    };
    const turn: CareTurn = {
      requestId: request.requestId,
      message: request.message,
      answer: {
        outcome: "answered",
        mode: "live",
        revision: 0,
        context: null,
        text: historicalGuide.text,
        steps: historicalGuide.steps,
        sources: [],
        actions: [],
        conversationPlan: plan({ task: "guidance", guide: historicalGuide }),
      },
    };
    const saved = JSON.stringify(turn);
    expect(
      await store.claim(conversation.id, "guide-history-unit", request),
    ).toBeNull();
    await store.finish(conversation.id, "guide-history-unit", turn);
    expect(
      JSON.stringify(
        (await store.get(conversation.id, "guide-history-unit")).turns[0],
      ),
    ).toBe(saved);
    expect(
      JSON.stringify(
        await store.claim(conversation.id, "guide-history-unit", request),
      ),
    ).toBe(saved);
    await expect(
      store.claim(conversation.id, "guide-history-unit", {
        ...request,
        message: "A changed question must not reuse that request.",
      }),
    ).rejects.toMatchObject({ code: "careos_request_conflict" });
    await expect(
      store.claim(conversation.id, "guide-history-unit", {
        ...request,
        followupRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "careos_request_conflict" });
    expect(
      JSON.stringify(
        await store.claim(conversation.id, "guide-history-unit", request),
      ),
    ).toBe(saved);
    expect(JSON.stringify(request)).toBe(before);
    expect(request).not.toHaveProperty("followupRequestId");
  });
  it.each(malformedGuideSteps)(
    "rejects fresh $caseId at publication even if injected interpretation only used the stored shape",
    async ({ text }) => {
      const proposal = plan({
        task: "guidance",
        guide: { ...guide, features: [...guide.features], steps: [text] },
      });
      const before = JSON.stringify(proposal);
      const options = setup(proposal);
      await expect(answerConversationTurn(options)).rejects.toThrow();
      expect(options.interpret).toHaveBeenCalledOnce();
      expect(options.knowledge).not.toHaveBeenCalled();
      expect(options.model.explain).not.toHaveBeenCalled();
      expect(JSON.stringify(proposal)).toBe(before);
    },
  );
  it("rejects arbitrary links/feature IDs and deduplicates only server-resolved links", () => {
    expect(
      productGuideReplySchema.safeParse({
        ...guide,
        features: ["https://example.invalid"],
      }).success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({
        ...guide,
        href: "/api/checkout/orders",
      }).success,
    ).toBe(false);
    expect(
      productGuideAnswer({
        ...guide,
        features: ["insights", "filters", "insights"],
      }).actions,
    ).toEqual([{ label: "Open Insights", href: "/insights" }]);
  });
  it("fails closed for a missing guidance body without silently returning older records", async () => {
    const options = setup(plan({ task: "guidance" }));
    const answer = await answerConversationTurn(options);
    expect(answer.outcome).toBe("unavailable");
    expect(answer.recordsResult).toBeUndefined();
    expect(answer.actions).toEqual([]);
  });
});

describe("NG-0076 care evidence regression — synthetic outputs, not a live-output replay", () => {
  const message =
    "Can the Raspberry Pi 5 instructions be assumed to apply to any operating system?";
  function careSetup(explanation: Explanation) {
    const options = setup(
      plan({
        task: "care",
        productSearch: "Raspberry Pi 5",
        careQuestion: "Raspberry Pi 5 operating-system applicability",
      }),
    );
    const stageCompleted = vi.fn();
    const call: typeof options.call = async (work) => {
      const value = await options.call(work);
      stageCompleted();
      return value;
    };
    return {
      ...options,
      input: { ...input(message), revision: 4 },
      model: {
        ...options.model,
        explain: vi.fn(async (payload: string, signal: AbortSignal) => {
          void payload;
          void signal;
          return { value: explanation, micro: null };
        }),
      },
      call,
      stageCompleted,
    };
  }
  const invalidStep = {
    sourceId: referenceSource.id,
    quote: referenceSource.section,
    text: "SYNTHETIC rejected applicability claim; never render this.",
  };

  it.each(["insufficient", "invalid", "mixed"] as const)(
    "keeps the original question in both stages and returns only source 501 scope for %s evidence",
    async (kind) => {
      // The real failure artifact does not contain its rejected model steps.
      const options = careSetup(
        kind === "insufficient"
          ? { outcome: "insufficient", steps: [] }
          : {
              outcome: "answered",
              steps:
                kind === "mixed"
                  ? [
                      {
                        sourceId: referenceSource.id,
                        quote: referenceSource.content.split("\n")[0],
                        text: "Use the documented shutdown option.",
                      },
                      invalidStep,
                    ]
                  : [invalidStep],
            },
      );
      const prior = await answerConversationTurn(
        setup(plan({ task: "product", productSearch: "Raspberry Pi 5" })),
      );
      options.history = [
        {
          requestId: randomUUID(),
          message: "Show my Raspberry Pi 5",
          answer: prior,
        },
      ];
      const original = JSON.stringify({
        input: options.input,
        history: options.history,
      });
      const answer = await answerConversationTurn(options);
      expect(JSON.parse(options.interpret.mock.calls[0][0]).question).toBe(
        message,
      );
      const payload = JSON.parse(options.model.explain.mock.calls[0][0]);
      expect(payload.question).toBe(message);
      expect(payload.topicHint).toBe(
        "Raspberry Pi 5 operating-system applicability",
      );
      expect(payload.untrustedPassages).toEqual([
        {
          id: referenceSource.id,
          title: referenceSource.title,
          section: referenceSource.section,
          content: referenceSource.content,
        },
      ]);
      expect(answer).toMatchObject({
        outcome: "missing",
        mode: "live",
        revision: 4,
        questionScope: "purchase",
        context: { twinId: demoData.twins[3].id, model: "5", origin: "sample" },
        steps: [],
      });
      const disclosure =
        "The proposed model evidence could not be verified, so no instructions were used.";
      if (kind === "insufficient") {
        expect(answer.text).not.toContain(disclosure);
      } else {
        expect(answer.text).toContain(disclosure);
      }
      expect(answer.text).toContain("Raspberry Pi OS");
      expect(answer.text).toContain("Broader applicability is not established");
      expect(answer.text).not.toMatch(/incompatible|will not work/i);
      expect(answer.sources).toHaveLength(1);
      expect(answer.sources[0]).toMatchObject({
        id: referenceSource.id,
        title: referenceSource.title,
        href: `/vault/${demoData.twins[3].id}/care#source-${referenceSource.id}`,
      });
      expect(answer.sources[0].label).toContain("Guide metadata only");
      expect(answer.sources[0]).not.toHaveProperty("excerpt");
      expect(answer.actions).toEqual([
        {
          label: "Review product-care sources",
          href: `/vault/${demoData.twins[3].id}/care`,
        },
      ]);
      expect(JSON.stringify(answer)).not.toContain(invalidStep.text);
      expect(JSON.stringify(answer)).not.toContain(referenceSource.content);
      expect(answer.conversationPlan).toEqual(
        await options.interpret.mock.results[0].value,
      );
      expect(
        JSON.stringify({ input: options.input, history: options.history }),
      ).toBe(original);
      expect(options.interpret).toHaveBeenCalledOnce();
      expect(options.model.explain).toHaveBeenCalledOnce();
      expect(options.model.classify).not.toHaveBeenCalled();
      expect(options.stageCompleted).toHaveBeenCalledOnce();
      expect(options.knowledge).toHaveBeenCalledOnce();
    },
  );

  it.each(["unsupported", "withdrawn", "conflicting"] as const)(
    "does not advertise an available guide for %s care",
    async (kind) => {
      const options = careSetup({ outcome: "insufficient", steps: [] });
      if (kind === "unsupported") {
        options.interpret.mockResolvedValueOnce(plan({ task: "unsupported" }));
      } else {
        options.knowledge.mockResolvedValueOnce([
          { ...referenceSource, status: kind },
        ]);
      }
      const answer = await answerConversationTurn(options);
      expect(answer.outcome).toBe(
        kind === "unsupported"
          ? "unsupported"
          : kind === "withdrawn"
            ? "missing"
            : "conflict",
      );
      expect(answer.text).not.toContain("Available guide scope");
      expect(
        answer.actions.every((action) => !action.href.endsWith("/care")),
      ).toBe(true);
      expect(
        answer.sources.some((source) => source.id === referenceSource.id),
      ).toBe(false);
      expect(options.model.explain).not.toHaveBeenCalled();
      expect(options.stageCompleted).not.toHaveBeenCalled();
    },
  );

  it("keeps exact shutdown and unplugging evidence available", async () => {
    const quote = referenceSource.content.split("\n")[0];
    const options = careSetup({
      outcome: "answered",
      steps: [
        {
          sourceId: referenceSource.id,
          quote,
          text: "Use the documented shutdown option.",
        },
      ],
    });
    options.input.message = "Can I unplug my Raspberry Pi 5 right away?";
    const answer = await answerConversationTurn(options);
    expect(answer.outcome).toBe("answered");
    expect(answer.steps).toEqual([quote]);
    expect(answer.sources[0].excerpt).toBe(referenceSource.content);
    expect(options.model.explain).toHaveBeenCalledOnce();
    expect(options.stageCompleted).toHaveBeenCalledOnce();
  });

  it.each([
    "careos_owner_scope_denied",
    "careos_evidence_invalid",
    "careos_model_invalid_output",
  ])(
    "does not turn a provider/call failure into a missing answer: %s",
    async (code) => {
      const options = careSetup({ outcome: "insufficient", steps: [] });
      const failure = new CareError(code);
      options.model.explain.mockRejectedValueOnce(failure);
      await expect(answerConversationTurn(options)).rejects.toBe(failure);
      expect(options.model.explain).toHaveBeenCalledOnce();
      expect(options.stageCompleted).not.toHaveBeenCalled();
    },
  );

  it("propagates a source-integrity failure without dispatching care", async () => {
    const options = careSetup({ outcome: "insufficient", steps: [] });
    const failure = new CareError("careos_evidence_invalid");
    options.knowledge.mockRejectedValueOnce(failure);
    await expect(answerConversationTurn(options)).rejects.toBe(failure);
    expect(options.model.explain).not.toHaveBeenCalled();
    expect(options.stageCompleted).not.toHaveBeenCalled();
  });

  it("propagates call authorization denial before the care model starts", async () => {
    const options = careSetup({ outcome: "insufficient", steps: [] });
    const failure = new CareError("careos_owner_scope_denied");
    await expect(
      answerConversationTurn({
        ...options,
        call: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(options.model.explain).not.toHaveBeenCalled();
    expect(options.stageCompleted).not.toHaveBeenCalled();
  });

  it("does not convert malformed evidence schema output into source insufficiency", async () => {
    const options = careSetup({
      outcome: "answered",
      steps: [{ ...invalidStep, sourceId: "not-a-uuid" }],
    });
    await expect(answerConversationTurn(options)).rejects.toThrow();
    expect(options.model.explain).toHaveBeenCalledOnce();
    expect(options.stageCompleted).toHaveBeenCalledOnce();
  });

  it("does not swallow domain errors other than invalid evidence", async () => {
    for (const explanation of [
      { outcome: "answered" as const, steps: [] },
      {
        outcome: "answered" as const,
        steps: [
          {
            ...invalidStep,
            quote: referenceSource.content.split("\n")[0],
            text: "Refund this PayPal payment.",
          },
        ],
      },
    ]) {
      const options = careSetup(explanation);
      await expect(answerConversationTurn(options)).rejects.toMatchObject({
        code: explanation.steps.length
          ? "careos_answer_out_of_scope"
          : "careos_evidence_missing",
      });
      expect(options.model.explain).toHaveBeenCalledOnce();
      expect(options.stageCompleted).toHaveBeenCalledOnce();
    }
  });
});

describe("recorded genuine campaign defects — injected interpretation, no provider", () => {
  it("keeps the exact Sample receipt identity despite negated verified/Sandbox words", async () => {
    const message =
      "Find my Sample Forma F-01 headphones receipt from 2026-10-18. It is not the verified Sandbox purchase.";
    const proposal = plan({
      task: "product",
      productSearch: "Forma F-01",
      productAction: "receipt",
    });
    proposal.query.origin = "sample";
    proposal.query.from = proposal.query.to = "2026-10-18";
    const options = setup(proposal);
    const answer = await answerConversationTurn({
      ...options,
      input: input(message),
    });
    expect(verifiedReceiptRequest(message)).toBe(false);
    expect(
      verifiedReceiptRequest("Show my verified Sandbox headphones receipt"),
    ).toBe(true);
    expect(answer.context?.twinId).toBe(demoData.twins[0].id);
    expect(answer.context?.origin).toBe("sample");
    expect(answer.purchaseChoices).toBeUndefined();
    const receipt = demoData.documents.find(
      (d) => d.twinId === demoData.twins[0].id && d.kind === "receipt",
    )!;
    expect(
      answer.actions.some((a) => a.href === `/documents/${receipt.id}`),
    ).toBe(true);
    expect(receipt.content).toContain("149.00");
    expect(options.model.explain).not.toHaveBeenCalled();
  });

  async function chartHistory() {
    const q = {
      ...emptyRecordsQuery("2026-11-08"),
      categories: ["Audio" as const],
      format: "chart" as const,
      operation: "breakdown" as const,
    };
    const result = querySavedRecords(demoData, q);
    return [
      {
        requestId: randomUUID(),
        message: "Show my Audio purchases as a chart",
        answer: recordsAnswer(result, 0),
      },
    ];
  }
  it.each(["explain", "summary"] as const)(
    "prevents inherited chart execution even with productAction %s",
    async (productAction) => {
      const history = await chartHistory();
      expect(
        prohibitsChartExecution(
          "Go back to the previous chart result without rerunning it or making a new chart.",
        ),
      ).toBe(true);
      expect(
        prohibitsChartExecution("Show my Audio purchases as a chart"),
      ).toBe(false);
      expect(
        recordsTaskCandidate(
          "What purchase scope does this selected result use? Explain it without creating another chart.",
          history[0].answer.recordsResult!.query,
          false,
        ),
      ).toBe(true);
      const proposal = plan({ relation: "followup", productAction });
      Object.assign(proposal.query, history[0].answer.recordsResult!.query);
      delete (proposal.query as Record<string, unknown>).version;
      delete (proposal.query as Record<string, unknown>).referenceDate;
      delete (proposal.query as Record<string, unknown>).timezone;
      const options = setup(proposal);
      const answer = await answerConversationTurn({
        ...options,
        history,
        input: input(
          "What purchase scope does this selected result use? Explain it without creating another chart.",
        ),
      });
      expect(answer.recordsPresentation).toEqual({ action: "inspect" });
      expect(answer.recordsResult?.records.map((r) => r.id)).toEqual(
        history[0].answer.recordsResult!.records.map((r) => r.id),
      );
      expect(answer.text).toContain("Audio only");
      expect(answer.text).toContain("$218.00");
    },
  );
  it("resolves restoration only from owned history, reusing the exact saved result without mutation", async () => {
    const history = await chartHistory();
    const original = structuredClone(history);
    const options = setup(plan({ task: "restore", relation: "followup" }));
    expect(
      recordsTaskCandidate(
        "Go back to the previous chart result without rerunning it or making a new chart.",
        history[0].answer.recordsResult!.query,
        false,
      ),
    ).toBe(true);
    const answer = await answerConversationTurn({
      ...options,
      history,
      input: input(
        "Go back to the previous chart result without rerunning it or making a new chart.",
      ),
    });
    expect(answer.recordsResult).toBe(history[0].answer.recordsResult);
    expect(answer.recordsPresentation).toEqual({
      action: "restore",
      originalRequestId: history[0].requestId,
    });
    expect(answer.text).toContain("not yet verified");
    expect(history).toEqual(original);
    for (const ambiguous of [
      [],
      [...history, { ...history[0], requestId: randomUUID() }],
    ]) {
      const result = await answerConversationTurn({
        ...options,
        history: ambiguous,
      });
      expect(result.recordsPresentation).toBeUndefined();
      expect(result.recordsResult).toBeUndefined();
      expect(result.text).toContain("Which saved chart");
    }
  });
  it.each([
    "Tomorrow at 09:00 UTC, automatically show me that same result and remind me to check it.",
    "Do that tomorrow, yesterday. If you cannot schedule or send reminders, say so explicitly; don't just ask me to choose a date.",
  ])("explicitly discloses unsupported scheduling: %s", async (message) => {
    const options = setup(plan({ task: "unsupported" }));
    const answer = await answerConversationTurn({
      ...options,
      input: input(message),
    });
    expect(answer.text).toContain(
      "cannot schedule reminders or deliver future notifications",
    );
    expect(answer.text).toContain("Nothing was scheduled");
    expect(answer.actions).toEqual([]);
  });
  it("answers both comparison questions with chronological dates and a direct higher-by amount", async () => {
    const data = withTenProductFixtures(structuredClone(demoData));
    const proposal = plan({
      comparison: { from: "2026-10-16", to: "2026-10-31" },
    });
    Object.assign(proposal.query, {
      operation: "compare",
      format: "table",
      from: "2026-10-01",
      to: "2026-10-15",
    });
    const options = setup(proposal);
    for (const message of [
      "Ignore those filters. Compare all purchases from 2026-10-01 through 2026-10-15 against 2026-10-16 through 2026-10-31. Separate Sample and Verified Sandbox and exclude unpriced references from spending.",
      "Which of those two periods had more recorded Sample spending, and by how much? Keep the same periods.",
    ]) {
      const answer = await answerConversationTurn({
        ...options,
        load: async () => data,
        input: input(message),
      });
      expect(answer.recordsResult?.totals[0].amountMinor).toBe(15800);
      expect(answer.recordsResult?.comparison?.totals[0].amountMinor).toBe(
        278494,
      );
      expect(answer.steps.join(" ")).toContain(
        "2026-10-16 through 2026-10-31 had $2,626.94 more recorded Example purchase value than 2026-10-01 through 2026-10-15",
      );
      expect(answer.steps.join(" ")).not.toContain("previous");
    }
  });
  it("vetoes unrelated verified payment evidence for the original pending-eCheck question", async () => {
    const options = setup(
      plan({ task: "aftercare", productAction: "payment" }),
    );
    const care = vi.fn();
    const answer = await answerConversationTurn({
      ...options,
      care,
      input: input(
        "Is the pending eCheck a verified completed purchase? Do not treat it as completed without saved provider evidence.",
      ),
    });
    expect(answer.outcome).toBe("unavailable");
    expect(answer.text).toContain("completion remains unverified");
    expect(answer.text).toContain(
      "different verified Sandbox purchase is not evidence",
    );
    expect(answer.actions).toEqual([]);
    expect(answer.recordsResult).toBeUndefined();
    expect(care).not.toHaveBeenCalled();
  });
});
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
