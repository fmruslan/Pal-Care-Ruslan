import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import {
  MODEL,
  REASONING,
  MODEL_REQUEST_BYTES,
} from "../../src/lib/careos/model-policy";
import {
  assertStructuredRequestSize,
  structuredRequestBody,
  structuredRequestBytes,
} from "../../src/lib/careos/subscription/request";
import { streamStructured } from "../../src/lib/careos/subscription/pilot";
import { standingStructured } from "../../src/lib/careos/subscription/standing";
import type { StandingOwner } from "../../src/lib/careos/standing-owner";
import type { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  conversationPayload,
  conversationPlanSchema,
  conversationModelPlanSchema,
  CONVERSATION_MODEL_PROMPT,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { demoData } from "../../src/lib/demo/fixtures";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { productGuideReplySchema } from "../../src/lib/careos/product-guide";
import { malformedGuideSteps } from "../fixtures/product-guide-prose";
import { deepseekRequestBody } from "../../src/lib/careos/providers/deepseek-request";

const sdkConstruction = vi.hoisted(() => vi.fn());
vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("openai")>();
  return {
    ...actual,
    default: class extends actual.default {
      constructor(options?: ConstructorParameters<typeof actual.default>[0]) {
        sdkConstruction();
        super(options);
      }
    },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  sdkConstruction.mockClear();
});

const date = "2026-11-06";
const schemaName = "north_conversation_v1";
const wire = (payload: string) =>
  structuredRequestBody({
    payload,
    prompt: CONVERSATION_MODEL_PROMPT,
    schema: conversationModelPlanSchema,
    name: schemaName,
  });
function plan(change: Partial<ConversationPlan> = {}): ConversationPlan {
  const { version, referenceDate, timezone, ...query } =
    emptyRecordsQuery(date);
  void version;
  void referenceDate;
  void timezone;
  return conversationPlanSchema.parse({
    task: "records",
    relation: "fresh",
    query: { ...query, outcome: "query" },
    comparison: null,
    productSearch: "",
    productAction: "summary",
    careQuestion: "",
    clarification: "",
    guide: null,
    ...change,
  });
}
function payloadAtBytes(target: number) {
  return "x".repeat(target - structuredRequestBytes(wire("")));
}
const mixedBoundaryQuestion =
  'Find "my receipt" at C:\\saved\\receipts\n原始问题🙂 café';
function mixedPayloadAtBytes(target: number) {
  const value = { question: mixedBoundaryQuestion, padding: "" };
  const overhead = structuredRequestBytes(wire(JSON.stringify(value)));
  value.padding = "x".repeat(target - overhead);
  return JSON.stringify(value);
}
function protocolResponse(value: unknown) {
  const response = {
    id: "resp_budget_fixture",
    status: "completed",
    model: MODEL,
    reasoning: { effort: REASONING },
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 1 },
    },
    output: [
      {
        id: "msg_budget_fixture",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify(value), annotations: [] },
        ],
      },
    ],
  };
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", sequence_number: 1, response })}\n\ndata: [DONE]\n\n`,
    {
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "req_budget_fixture",
      },
    },
  );
}

/** Fictional equivalent of the eight-turn 11-record prefix; no captured
 * credentials, real customer records or Sandbox payment identifiers. */
function prefix() {
  const extra = Array.from({ length: 7 }, (_, index) => ({
    ...demoData.products[1],
    id: randomUUID(),
    name: `Fictional reference product ${index + 1}`,
    model: `Fixture ${index + 1} · neutral finish · reference edition`,
  }));
  const data = {
    ...demoData,
    products: [...demoData.products, ...extra],
    twins: [
      ...demoData.twins,
      ...extra.map((product) => ({
        ...demoData.twins[1],
        id: randomUUID(),
        productId: product.id,
      })),
    ],
  };
  const library = querySavedRecords(data, emptyRecordsQuery(date));
  const messages = [
    "Show all my purchases",
    "Only Audio",
    "Only verified",
    "Find that receipt",
    "Now find my Raspberry Pi",
    "How do I shut it down?",
    "Can I unplug it right away?",
    "Back to all saved purchases",
  ];
  const history = messages.map<CareTurn>((message, index) => {
    const proposal = plan({ relation: index ? "followup" : "fresh" });
    if (index === 1 || index === 2) proposal.query.categories = ["Audio"];
    if (index === 2) proposal.query.origin = "sandbox";
    if (index === 4) proposal.query.search = "Raspberry Pi";
    proposal.query.format = "bullets";
    const { outcome, ...query } = proposal.query;
    void outcome;
    const result = querySavedRecords(data, {
      ...emptyRecordsQuery(date),
      ...query,
    });
    const answer = { ...recordsAnswer(result, 0), conversationPlan: proposal };
    if (index === 3 || index === 5 || index === 6) {
      return {
        requestId: randomUUID(),
        message,
        answer: {
          outcome: "answered",
          mode: "fixture",
          revision: 0,
          questionScope: "purchase",
          context: {
            twinId: demoData.twins[3].id,
            name: "Raspberry Pi 5",
            model: "5",
            origin: "sample",
            purchasedOn: "2026-10-07",
          },
          text:
            index === 3
              ? "This fictional purchase has saved documents."
              : "Raspberry Pi 5 · saved shutdown guidance; check its software conditions.",
          steps: [],
          actions: [],
          sources: [],
          conversationPlan: plan({
            task: index === 3 ? "product" : "care",
            relation: "followup",
            productSearch: "Raspberry Pi 5",
            careQuestion:
              index === 6
                ? "Can I unplug the Raspberry Pi 5 right away?"
                : "How do I shut down the Raspberry Pi 5?",
          }),
        },
      };
    }
    return { requestId: randomUUID(), message, answer };
  });
  return { library, history };
}
const requestInput = (message: string, anchor?: string) => ({
  requestId: randomUUID(),
  twinId: null,
  revision: 0,
  message,
  ...(anchor ? { followupRequestId: anchor } : {}),
});

describe("exact shared North wire byte boundary, injected protocol only", () => {
  it("serializes one basic guide punctuation pattern, not local Unicode refinements or unsupported allOf", () => {
    const format = JSON.parse(JSON.stringify(wire("schema-only"))).text.format;
    expect(format).toMatchObject({ type: "json_schema", strict: true });
    expect(format.schema.required).toContain("guide");
    const guide = format.schema.properties.guide.anyOf.find(
      (branch: { type?: string }) => branch.type === "object",
    );
    expect(guide).toMatchObject({
      required: ["text", "steps", "features"],
      additionalProperties: false,
      properties: {
        text: {
          type: "string",
          minLength: 20,
          maxLength: 620,
          pattern: expect.any(String),
        },
        steps: {
          minItems: 1,
          maxItems: 5,
          items: {
            type: "string",
            minLength: 5,
            maxLength: 180,
            pattern: expect.any(String),
          },
        },
        features: { minItems: 1, maxItems: 3 },
      },
    });
    expect(JSON.stringify(guide)).not.toContain('"allOf"');
    const pattern = guide.properties.steps.items.pattern;
    expect(guide.properties.text.pattern).toBe(pattern);
    expect(pattern).not.toContain("\\p{");
    const wireEnding = new RegExp(pattern);
    for (const { text } of malformedGuideSteps)
      expect(wireEnding.test(text)).toBe(false);
    expect(wireEnding.test("Review café → 保存记录.\u201d")).toBe(true);
    // Full Unicode and absolute-end checks are explicitly local-only.
    const invisible = "Review the saved\u200c receipt.";
    expect(wireEnding.test(invisible)).toBe(true);
    expect(
      productGuideReplySchema.safeParse({
        text: invisible,
        steps: ["Read."],
        features: ["care"],
      }).success,
    ).toBe(false);
    expect(wireEnding.test("Review saved evidence.\n")).toBe(false);
    expect(
      productGuideReplySchema.safeParse({
        text: "Review saved evidence.\n",
        steps: ["Read."],
        features: ["care"],
      }).success,
    ).toBe(false);
  });
  it.each(malformedGuideSteps)(
    "keeps a completed but invalid $caseId output charged unknown without automatic retry, injected protocol only",
    async ({ text }) => {
      const noNetwork = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network_forbidden"));
      const owner = {
        assertDispatch: vi.fn(async () => ({ maxRetries: 1 })),
        assertHistoricalJournal: vi.fn(async () => {}),
        reserve: vi.fn(async () => {}),
        settle: vi.fn(async () => {}),
        blockProvider: vi.fn(),
      };
      // Fake credential acquisition only; no host files or refresh are touched.
      const files = {
        read: vi.fn(async () => ({ immutable: "unit-history" })),
        lockedWaiting: vi.fn(async () => "injected-protocol-token"),
        write: vi.fn(),
      };
      const value = plan({
        task: "guidance",
        guide: {
          text: "Review the saved purchase evidence.",
          steps: [text],
          features: ["care"],
        },
      });
      const transport = vi.fn(async () => protocolResponse(value));
      const requestId = randomUUID();
      await expect(
        standingStructured({
          files: files as unknown as PilotFiles,
          owner: owner as unknown as StandingOwner,
          proof: { agent: "injected-unit-owner" },
          scope: "customer",
          enabled: () => true,
          requestId,
          payload: "injected-guide-output",
          prompt: CONVERSATION_MODEL_PROMPT,
          schema: conversationModelPlanSchema,
          name: schemaName,
          signal: new AbortController().signal,
          transport,
        }),
      ).rejects.toMatchObject({ code: "pilot_structured_output_invalid" });
      expect(transport).toHaveBeenCalledOnce();
      expect(owner.reserve).toHaveBeenCalledOnce();
      expect(owner.settle).toHaveBeenCalledExactlyOnceWith(
        `customer:${requestId}:${schemaName}`,
        "unknown",
        expect.objectContaining({ httpStatus: 200 }),
      );
      expect(files.lockedWaiting).toHaveBeenCalledOnce();
      expect(files.write).not.toHaveBeenCalled();
      expect(owner.blockProvider).not.toHaveBeenCalled();
      expect(noNetwork).not.toHaveBeenCalled();
    },
  );
  it("constructs the exact production body including the centralized aftercare prompt and real Zod format", () => {
    expect(wire("unit")).toEqual({
      model: MODEL,
      reasoning: { effort: REASONING },
      store: false,
      stream: true,
      input: [
        { role: "developer", content: CONVERSATION_MODEL_PROMPT },
        { role: "user", content: "unit" },
      ],
      text: { format: zodTextFormat(conversationModelPlanSchema, schemaName) },
    });
    expect(CONVERSATION_MODEL_PROMPT).toContain(
      "aftercare: use this read-only ownership task",
    );
    expect(MODEL_REQUEST_BYTES).toBe(20000);
  });
  it("measures UTF-8 and JSON escaping rather than UTF-16 characters or raw payload length", () => {
    const payload = JSON.stringify({
      question: '原始问题🙂 "quoted" \\ unchanged',
    });
    const body = wire(payload);
    expect(structuredRequestBytes(body)).toBe(
      Buffer.byteLength(JSON.stringify(body), "utf8"),
    );
    expect(structuredRequestBytes(body)).toBeGreaterThan(
      JSON.stringify(body).length,
    );
    expect(structuredRequestBytes(body)).toBeGreaterThan(
      Buffer.byteLength(payload),
    );
  });
  it.each([19999, 20000])(
    "accepts exactly %i wire bytes through the real SDK with fake transport only",
    async (size) => {
      const payload = payloadAtBytes(size);
      expect(structuredRequestBytes(wire(payload))).toBe(size);
      expect(() => assertStructuredRequestSize(wire(payload))).not.toThrow();
      const noNetwork = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network_forbidden"));
      const beforeDispatch = vi.fn(async () => {});
      const value = plan({
        task: "clarification",
        clarification: "Which saved purchase?",
      });
      const transport = vi.fn(
        async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
          expect(beforeDispatch).toHaveBeenCalledOnce();
          expect(Buffer.byteLength(String(init?.body))).toBe(size);
          expect(JSON.parse(String(init?.body))).toEqual(wire(payload));
          return protocolResponse(value);
        },
      );
      const answer = await streamStructured({
        accessToken: "injected-budget-fixture-only",
        payload,
        prompt: CONVERSATION_MODEL_PROMPT,
        schema: conversationModelPlanSchema,
        name: schemaName,
        beforeDispatch,
        transport,
        observe: vi.fn(),
      });
      expect(answer.value).toEqual(value);
      expect(beforeDispatch).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledOnce();
      expect(sdkConstruction).toHaveBeenCalledOnce();
      expect(noNetwork).not.toHaveBeenCalled();
    },
  );
  it.each([19999, 20000])(
    "retains mixed Unicode and JSON escapes at exactly %i wire bytes through injected SDK transport",
    async (size) => {
      const payload = mixedPayloadAtBytes(size);
      expect(JSON.parse(payload).question).toBe(mixedBoundaryQuestion);
      expect(Buffer.byteLength(payload)).toBeGreaterThan(payload.length);
      expect(structuredRequestBytes(wire(payload))).toBe(size);
      const noNetwork = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("network_forbidden"));
      const beforeDispatch = vi.fn(async () => {});
      const value = plan({
        task: "clarification",
        clarification: "Which saved purchase?",
      });
      const transport = vi.fn(
        async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
          expect(beforeDispatch).toHaveBeenCalledOnce();
          expect(Buffer.byteLength(String(init?.body), "utf8")).toBe(size);
          const received = JSON.parse(String(init?.body));
          expect(received).toEqual(wire(payload));
          expect(JSON.parse(received.input[1].content).question).toBe(
            mixedBoundaryQuestion,
          );
          return protocolResponse(value);
        },
      );
      const answer = await streamStructured({
        accessToken: "injected-budget-fixture-only",
        payload,
        prompt: CONVERSATION_MODEL_PROMPT,
        schema: conversationModelPlanSchema,
        name: schemaName,
        beforeDispatch,
        transport,
        observe: vi.fn(),
      });
      expect(answer.value).toEqual(value);
      expect(beforeDispatch).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledOnce();
      expect(sdkConstruction).toHaveBeenCalledOnce();
      expect(noNetwork).not.toHaveBeenCalled();
    },
  );
  it.each([
    { kind: "ASCII", payload: () => payloadAtBytes(20001) },
    {
      kind: "mixed Unicode/escaping",
      payload: () => mixedPayloadAtBytes(20001),
    },
  ])(
    "rejects 20001 $kind wire bytes before client construction, dispatch, observation or transport",
    async ({ payload: makePayload }) => {
      const payload = makePayload();
      expect(structuredRequestBytes(wire(payload))).toBe(20001);
      const beforeDispatch = vi.fn(async () => {});
      const transport = vi.fn(async () => protocolResponse(plan()));
      const observe = vi.fn();
      await expect(
        streamStructured({
          accessToken: "injected-budget-fixture-only",
          payload,
          prompt: CONVERSATION_MODEL_PROMPT,
          schema: conversationModelPlanSchema,
          name: schemaName,
          beforeDispatch,
          transport,
          observe,
        }),
      ).rejects.toMatchObject({ code: "pilot_request_too_large" });
      expect(sdkConstruction).not.toHaveBeenCalled();
      expect(beforeDispatch).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
    },
  );
  it.each([
    { kind: "ASCII", payload: () => payloadAtBytes(20001) },
    {
      kind: "mixed Unicode/escaping",
      payload: () => mixedPayloadAtBytes(20001),
    },
  ])(
    "rejects oversize $kind input after owner checks but before any credential refresh, reservation or transport",
    async ({ payload: makePayload }) => {
      const owner = {
        assertDispatch: vi.fn(async () => ({ maxRetries: 1 })),
        assertHistoricalJournal: vi.fn(async () => {}),
        reserve: vi.fn(),
        settle: vi.fn(),
        blockProvider: vi.fn(),
      };
      const refresh = vi.fn(async () => {
        throw Error("credential_acquisition_forbidden");
      });
      const files = {
        read: vi.fn(async () => ({ immutable: "unit-history" })),
        lockedWaiting: refresh,
        write: vi.fn(),
      };
      const transport = vi.fn(async () => protocolResponse(plan()));
      await expect(
        standingStructured({
          files: files as unknown as PilotFiles,
          owner: owner as unknown as StandingOwner,
          proof: { agent: "injected-unit-owner" },
          scope: "customer",
          enabled: () => true,
          requestId: randomUUID(),
          payload: makePayload(),
          prompt: CONVERSATION_MODEL_PROMPT,
          schema: conversationModelPlanSchema,
          name: schemaName,
          signal: new AbortController().signal,
          transport,
        }),
      ).rejects.toMatchObject({ code: "pilot_request_too_large" });
      expect(owner.assertDispatch).toHaveBeenCalledOnce();
      expect(owner.assertHistoricalJournal).toHaveBeenCalledOnce();
      expect(files.read).toHaveBeenCalledExactlyOnceWith("session.json");
      expect(refresh).not.toHaveBeenCalled();
      expect(owner.reserve).not.toHaveBeenCalled();
      expect(owner.settle).not.toHaveBeenCalled();
      expect(owner.blockProvider).not.toHaveBeenCalled();
      expect(files.write).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      expect(sdkConstruction).not.toHaveBeenCalled();
    },
  );
  it("retains authorization denial before size preflight or credential access", async () => {
    const owner = {
      assertDispatch: vi.fn(async () => {
        throw Error("owner_denied");
      }),
      assertHistoricalJournal: vi.fn(),
      reserve: vi.fn(),
    };
    const files = { read: vi.fn(), lockedWaiting: vi.fn() };
    await expect(
      standingStructured({
        files: files as unknown as PilotFiles,
        owner: owner as unknown as StandingOwner,
        proof: { agent: "injected-unit-owner" },
        scope: "customer",
        enabled: () => false,
        requestId: randomUUID(),
        payload: payloadAtBytes(20001),
        prompt: CONVERSATION_MODEL_PROMPT,
        schema: conversationModelPlanSchema,
        name: schemaName,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("owner_denied");
    expect(files.read).not.toHaveBeenCalled();
    expect(files.lockedWaiting).not.toHaveBeenCalled();
    expect(owner.reserve).not.toHaveBeenCalled();
  });
});

describe("North whole-context wire projection, fictional owned prefixes", () => {
  it("measures the exact hosted JSON-mode schema/instructions and retains the original question, anchor and stored history", () => {
    const { library, history } = prefix();
    const original = JSON.stringify(history);
    const question = 'Explain "those" purchases — 原始问题🙂';
    const payload = conversationPayload({
      hosted: true,
      input: requestInput(question, history.at(-1)!.requestId),
      history,
      library,
      selected: null,
      referenceDate: date,
    });
    const body = deepseekRequestBody({
      payload,
      prompt: CONVERSATION_MODEL_PROMPT,
      schema: conversationModelPlanSchema,
      name: schemaName,
    });
    expect(structuredRequestBytes(body)).toBeLessThanOrEqual(
      MODEL_REQUEST_BYTES,
    );
    expect(body.text?.format).toEqual({ type: "json_object" });
    expect(body.instructions).toContain('"additionalProperties":false');
    expect(body.input).toEqual([{ role: "user", content: payload }]);
    expect(JSON.parse(payload).question).toBe(question);
    expect(JSON.parse(payload).currentTopic.question).toBe(
      history.at(-1)!.message,
    );
    expect(JSON.stringify(history)).toBe(original);
  });
  it("fits the eleven-record eight-turn failure shape without duplicate facts or historical plans", () => {
    const { library, history } = prefix();
    const original = JSON.stringify(history);
    const latest = history.at(-1)!;
    // Legacy shape: the same facts appeared in latest, previous and catalogue,
    // while six full derived plans repeated schemas/queries and care hints.
    const legacy = JSON.stringify({
      question: "Which have no recorded price?",
      currentTopic: {
        question: latest.message,
        answer: latest.answer.text,
        recordsResult: {
          query: library.query,
          records: library.records.map(
            ({ name, model, category, purchasedOn, origin, amountMinor }) => ({
              name,
              model,
              category,
              purchasedOn,
              origin,
              amountMinor,
            }),
          ),
        },
      },
      previous: {
        query: library.query,
        records: library.records.map(
          ({ name, model, purchasedOn, origin }) => ({
            name,
            model,
            purchasedOn,
            origin,
          }),
        ),
      },
      history: history.slice(-6).map((turn) => ({
        question: turn.message,
        answer: turn.answer.text.slice(0, 800),
        context: turn.answer.context,
        plan: turn.answer.conversationPlan,
      })),
      catalogue: library.records.map(
        ({ name, model, category, purchasedOn, origin }) => ({
          name,
          model,
          category,
          purchasedOn,
          origin,
        }),
      ),
    });
    expect(structuredRequestBytes(wire(legacy))).toBeGreaterThan(
      MODEL_REQUEST_BYTES,
    );
    const payload = conversationPayload({
      input: requestInput("Which have no recorded price?", latest.requestId),
      history,
      library,
      selected: null,
      referenceDate: date,
    });
    const projected = JSON.parse(payload);
    expect(structuredRequestBytes(wire(payload))).toBeLessThanOrEqual(
      MODEL_REQUEST_BYTES,
    );
    expect(projected.question).toBe("Which have no recorded price?");
    expect(projected.currentTopic.question).toBe(latest.message);
    expect(projected.currentTopic.recordsResult.query).toEqual(
      latest.answer.recordsResult!.query,
    );
    expect(projected.currentTopic.recordsResult.recordCount).toBe(11);
    expect(projected.currentTopic.recordsResult.recordIndexes).toHaveLength(11);
    expect(projected.facts).toHaveLength(11);
    expect(projected.catalogue).toEqual(
      projected.currentTopic.recordsResult.recordIndexes,
    );
    expect(
      projected.history.map((turn: { question: string }) => turn.question),
    ).toEqual(history.map((turn) => turn.message));
    expect(
      projected.history.every((turn: object) => !Object.hasOwn(turn, "plan")),
    ).toBe(true);
    expect(projected.coverage.omittedOlderTurns).toBe(0);
    expect(JSON.stringify(history)).toBe(original);
  });
  it.each([25, 30])(
    "bounds %i long Unicode turns by reporting omitted whole turns, never shortening their questions",
    (length) => {
      const { library } = prefix();
      const history: CareTurn[] = Array.from({ length }, (_, index) => ({
        requestId: randomUUID(),
        message: `Original turn ${index + 1}: 原始问题🙂 `.repeat(30),
        answer: {
          ...recordsAnswer(library, 0),
          text: "Fictional saved-record explanation. ".repeat(40),
          conversationPlan: plan(),
        },
      }));
      const original = JSON.stringify(history);
      const message = 'Explain that more simply — 范围不变🙂 "unchanged"';
      const payload = conversationPayload({
        input: requestInput(message, history.at(-1)!.requestId),
        history,
        library,
        selected: null,
        referenceDate: date,
      });
      const projected = JSON.parse(payload);
      expect(structuredRequestBytes(wire(payload))).toBeLessThanOrEqual(
        MODEL_REQUEST_BYTES,
      );
      expect(projected.question).toBe(message);
      expect(projected.currentTopic.question).toBe(history.at(-1)!.message);
      expect(projected.currentTopic.recordsResult.query).toEqual(library.query);
      expect(projected.currentTopic.answerExcerpted).toBe(true);
      expect(projected.coverage.availableTurns).toBe(length);
      expect(projected.coverage.omittedOlderTurns).toBeGreaterThan(0);
      expect(
        projected.coverage.providedTurns + projected.coverage.omittedOlderTurns,
      ).toBe(length);
      expect(projected.history).toHaveLength(projected.coverage.providedTurns);
      for (const turn of projected.history)
        expect(turn.question).toBe(history[turn.turn - 1].message);
      expect(projected.history[0].turn).toBe(
        projected.coverage.omittedOlderTurns + 1,
      );
      expect(projected.history.at(-1).turn).toBe(length);
      expect(JSON.stringify(history)).toBe(original);
      expect(CONVERSATION_MODEL_PROMPT).toContain("Never claim access");
      expect(CONVERSATION_MODEL_PROMPT).toContain("ask a short clarification");
    },
  );
  it("rejects irreducible oversized current/anchor questions instead of truncating or removing the anchor", () => {
    const { library, history } = prefix();
    history.at(-1)!.message = "🙂".repeat(1000);
    const input = requestInput("🙂".repeat(1000), history.at(-1)!.requestId);
    const original = JSON.stringify({ input, history });
    expect(() =>
      conversationPayload({
        input,
        history,
        library,
        selected: null,
        referenceDate: date,
      }),
    ).toThrow("pilot_request_too_large");
    expect(JSON.stringify({ input, history })).toBe(original);
  });
});
