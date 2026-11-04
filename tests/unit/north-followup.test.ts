import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CareError,
  turnSchema,
  type CareTurn,
  type TurnInput,
} from "../../src/lib/careos/contracts";
import { ownedFollowupHistory } from "../../src/lib/careos/records/followup";
import {
  answerRecordsTurn,
  previousRecordsResult,
  querySavedRecords,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import { answerSemanticRecordsTurn } from "../../src/lib/careos/records/semantic-service";
import {
  answerConversationTurn,
  conversationPlanSchema,
} from "../../src/lib/careos/records/conversation-service";
import {
  emptyRecordsQuery,
  type RecordsQuery,
} from "../../src/lib/careos/records/contracts";
import type { ModelResult } from "../../src/lib/careos/providers/responses";
import { MemoryStore } from "../../src/lib/careos/store";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";

const day = "2026-11-03";
const now = () => new Date(`${day}T12:00:00Z`);
const input = (message: string): TurnInput => ({
  requestId: randomUUID(),
  twinId: null,
  revision: 0,
  message,
});
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function saved(category: "Audio" | "Kitchen"): CareTurn {
  return {
    requestId: randomUUID(),
    message: `Show my purchases in ${category}`,
    answer: recordsAnswer(
      querySavedRecords(
        demoData,
        { ...emptyRecordsQuery(day), categories: [category] },
        now().toISOString(),
      ),
      0,
    ),
  };
}
function proposal(query = emptyRecordsQuery(day)) {
  const { version, referenceDate, timezone, ...fields } = query;
  void version;
  void referenceDate;
  void timezone;
  return { ...fields, outcome: "query" as const };
}
function plan(query = emptyRecordsQuery(day)) {
  return conversationPlanSchema.parse({
    task: "records",
    relation: "followup",
    query: proposal(query),
    comparison: null,
    productSearch: "",
    productAction: "summary",
    careQuestion: "",
    clarification: "",
  });
}
function options(
  history: CareTurn[],
  question = input("Put those in a table"),
) {
  return {
    input: question,
    history,
    now,
    load: vi.fn(async () => demoData),
    interpret: vi.fn(async (payload: string): Promise<unknown> => {
      void payload;
      return plan();
    }),
    knowledge: vi.fn(async () => []),
    model: { classify: vi.fn(), explain: vi.fn() },
    call: async <T>(work: (signal: AbortSignal) => Promise<ModelResult<T>>) =>
      (await work(new AbortController().signal)).value,
  };
}

describe("owned North follow-up anchors — injected models only", () => {
  it("takes the original chronology through the selected owned turn without mutating it", () => {
    const audio = saved("Audio"),
      kitchen = saved("Kitchen");
    const history = [audio, kitchen];
    const original = structuredClone(history);
    expect(ownedFollowupHistory(history, audio.requestId)).toEqual([audio]);
    expect(ownedFollowupHistory(history, kitchen.requestId)).toEqual(history);
    expect(ownedFollowupHistory(history)).toBe(history);
    expect(history).toEqual(original);
  });

  it.each(["records", "semantic"] as const)(
    "%s formatting follows older selected Audio rather than newer Kitchen, with no reload or interpretation",
    async (channel) => {
      const audio = saved("Audio"),
        kitchen = saved("Kitchen");
      const history = [audio, kitchen];
      const original = structuredClone(history);
      const request = {
        ...input("Put those in a table"),
        followupRequestId: audio.requestId,
      };
      const dependencies = options(history, request);
      const answer = await (channel === "records"
        ? answerRecordsTurn(dependencies)
        : answerSemanticRecordsTurn(dependencies));
      expect(answer.recordsResult?.query).toMatchObject({
        categories: ["Audio"],
        format: "table",
      });
      expect(answer.recordsResult?.records).toEqual(
        audio.answer.recordsResult!.records,
      );
      expect(answer.recordsResult?.snapshotId).toBe(
        audio.answer.recordsResult!.snapshotId,
      );
      expect(request.requestId).not.toBe(audio.requestId);
      expect(dependencies.load).not.toHaveBeenCalled();
      expect(dependencies.interpret).not.toHaveBeenCalled();
      expect(history).toEqual(original);
    },
  );

  it("conversational chart interpretation sees only selected Audio history and computes its owned records", async () => {
    const audio = saved("Audio"),
      kitchen = saved("Kitchen");
    const dependencies = options([audio, kitchen], {
      ...input("Chart those purchases"),
      followupRequestId: audio.requestId,
    });
    dependencies.interpret.mockImplementation(async (raw) => {
      const payload = JSON.parse(raw);
      expect(payload.previous.query).toEqual(audio.answer.recordsResult!.query);
      expect(
        payload.history.map((turn: { question: string }) => turn.question),
      ).toEqual([audio.message]);
      return plan({
        ...payload.previous.query,
        format: "chart",
        operation: "breakdown",
      });
    });
    const answer = await answerConversationTurn(dependencies);
    expect(answer.recordsResult?.query.categories).toEqual(["Audio"]);
    expect(answer.recordsResult?.records).toEqual(
      audio.answer.recordsResult!.records,
    );
    expect(dependencies.interpret).toHaveBeenCalledOnce();
    expect(dependencies.model.explain).not.toHaveBeenCalled();
  });

  it("semantic interpretation receives the selected owned previous query, never newer filters", async () => {
    const audio = saved("Audio");
    const dependencies = options([audio, saved("Kitchen")], {
      ...input(
        "Within those purchases, retain only items with an attached receipt.",
      ),
      followupRequestId: audio.requestId,
    });
    dependencies.interpret.mockImplementation(async (raw) => {
      const payload = JSON.parse(raw);
      expect(payload.contextScope).toBe("followup");
      expect(payload.previousQuery).toEqual(audio.answer.recordsResult!.query);
      return { ...proposal(payload.previousQuery), receipt: "present" };
    });
    const answer = await answerSemanticRecordsTurn(dependencies);
    expect(answer.recordsResult?.query).toMatchObject({
      categories: ["Audio"],
      receipt: "present",
    });
    expect(answer.recordsResult?.records.map((record) => record.id)).toEqual([
      "00000000-0000-4000-8000-000000000201",
    ]);
    expect(dependencies.interpret).toHaveBeenCalledOnce();
  });

  it("product follow-ups also resolve recent context from the selected owned prefix", async () => {
    const productTurn = (twinId: string): CareTurn => {
      const question = { ...input("Summarize this purchase"), twinId };
      return {
        requestId: question.requestId,
        message: question.message,
        answer: deterministicAnswer(demoData, question, "summary"),
      };
    };
    const headphones = productTurn("00000000-0000-4000-8000-000000000201");
    const kettle = productTurn("00000000-0000-4000-8000-000000000202");
    const dependencies = options([headphones, kettle], {
      ...input("Show that product's receipt"),
      followupRequestId: headphones.requestId,
    });
    dependencies.interpret.mockResolvedValue({
      ...plan(),
      task: "product",
      productAction: "receipt",
    });
    const answer = await answerConversationTurn(dependencies);
    expect(answer.context?.twinId).toBe(headphones.answer.context!.twinId);
    expect(answer.context?.twinId).not.toBe(kettle.answer.context!.twinId);
  });

  it.each(["records", "semantic", "conversation"] as const)(
    "%s retains latest-Kitchen behavior when the anchor is absent",
    async (channel) => {
      const kitchen = saved("Kitchen");
      const dependencies = options([saved("Audio"), kitchen]);
      dependencies.interpret.mockImplementation(async (raw) =>
        plan(JSON.parse(raw).previous.query as RecordsQuery),
      );
      const answer = await (channel === "records"
        ? answerRecordsTurn(dependencies)
        : channel === "semantic"
          ? answerSemanticRecordsTurn(dependencies)
          : answerConversationTurn(dependencies));
      expect(answer.recordsResult?.query.categories).toEqual(["Kitchen"]);
      expect(answer.recordsResult?.records).toEqual(
        kitchen.answer.recordsResult!.records,
      );
    },
  );

  it.each(["records", "semantic", "conversation"] as const)(
    "%s rejects unknown and other-conversation IDs before any data/model dependency, even for fresh tasks",
    async (channel) => {
      const store = new MemoryStore();
      const owned = await store.create("owner");
      const ownedInput = input("Show my purchases in Audio");
      await store.claim(owned.id, "owner", ownedInput);
      await store.finish(owned.id, "owner", {
        ...saved("Audio"),
        requestId: ownedInput.requestId,
      });
      const sibling = await store.create("owner");
      const siblingInput = input("Show my purchases in Kitchen");
      await store.claim(sibling.id, "owner", siblingInput);
      await store.finish(sibling.id, "owner", {
        ...saved("Kitchen"),
        requestId: siblingInput.requestId,
      });
      const foreign = await store.create("other-owner");
      const foreignInput = input("Show my purchases in Kitchen");
      await store.claim(foreign.id, "other-owner", foreignInput);
      await store.finish(foreign.id, "other-owner", {
        ...saved("Kitchen"),
        requestId: foreignInput.requestId,
      });
      const history = (await store.get(owned.id, "owner")).turns;
      for (const followupRequestId of [
        randomUUID(),
        siblingInput.requestId,
        foreignInput.requestId,
      ]) {
        for (const message of [
          "Show my purchases",
          "New topic",
          "Show warranties",
        ]) {
          const dependencies = options(history, {
            ...input(message),
            followupRequestId,
          });
          const answer =
            channel === "records"
              ? answerRecordsTurn(dependencies)
              : channel === "semantic"
                ? answerSemanticRecordsTurn(dependencies)
                : answerConversationTurn(dependencies);
          await expect(answer).rejects.toMatchObject({
            code: "careos_records_followup_not_found",
            status: 409,
          });
          expect(dependencies.load).not.toHaveBeenCalled();
          expect(dependencies.interpret).not.toHaveBeenCalled();
          expect(dependencies.knowledge).not.toHaveBeenCalled();
          expect(dependencies.model.classify).not.toHaveBeenCalled();
          expect(dependencies.model.explain).not.toHaveBeenCalled();
        }
      }
      await expect(store.get(foreign.id, "owner")).rejects.toBeInstanceOf(
        CareError,
      );
    },
  );

  it("retains reset markers, excludes later turns and never inherits through a selected reset", async () => {
    const audio = saved("Audio");
    const resetInput = input("New topic");
    const reset: CareTurn = {
      requestId: resetInput.requestId,
      message: resetInput.message,
      answer: await answerRecordsTurn(options([audio], resetInput)),
    };
    const history = [audio, reset, saved("Kitchen")];
    expect(ownedFollowupHistory(history, reset.requestId)).toEqual([
      audio,
      reset,
    ]);
    expect(
      previousRecordsResult(ownedFollowupHistory(history, reset.requestId)),
    ).toBeUndefined();
    // Explicitly selecting a result from the older topic can resume that result;
    // selecting the reset itself cannot fall back across its boundary.
    expect(
      previousRecordsResult(ownedFollowupHistory(history, audio.requestId)),
    ).toEqual(audio.answer.recordsResult);
    for (const answerTurn of [answerRecordsTurn, answerSemanticRecordsTurn]) {
      const dependencies = options(history, {
        ...input("Put those in a table"),
        followupRequestId: reset.requestId,
      });
      const answer = await answerTurn(dependencies);
      expect(answer.recordsResult).toBeUndefined();
      expect(answer.text).toContain("Which saved purchases");
      expect(dependencies.load).not.toHaveBeenCalled();
      expect(dependencies.interpret).not.toHaveBeenCalled();
    }
    const dependencies = options(history, {
      ...input("What next?"),
      followupRequestId: reset.requestId,
    });
    dependencies.interpret.mockImplementation(async (raw) => {
      expect(JSON.parse(raw).previous).toBeNull();
      return {
        ...plan(),
        task: "clarification",
        clarification: "Which purchases?",
      };
    });
    expect(
      (await answerConversationTurn(dependencies)).recordsResult,
    ).toBeUndefined();
  });

  it("keeps legacy serialized fields/fingerprints exact and appends the optional UUID only", () => {
    for (const extra of [{}, { intent: "receipt" }, { example: "insignia" }]) {
      const legacy = { ...input("Show my purchases"), ...extra };
      const parsed = turnSchema.parse(legacy);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(legacy));
      expect(fingerprint(parsed)).toBe(fingerprint(legacy));
      expect(parsed).not.toHaveProperty("followupRequestId");
      const followupRequestId = randomUUID();
      const anchored = turnSchema.parse({ followupRequestId, ...legacy });
      expect(Object.keys(anchored).at(-1)).toBe("followupRequestId");
      expect(JSON.stringify(anchored)).toBe(
        JSON.stringify({ ...legacy, followupRequestId }),
      );
      expect(fingerprint(anchored)).not.toBe(fingerprint(parsed));
    }
  });

  it("binds replay identity to the anchor without changing saved request IDs or results", async () => {
    const store = new MemoryStore();
    const conversation = await store.create("owner");
    const request = turnSchema.parse({
      ...input("Put those in a table"),
      followupRequestId: randomUUID(),
    });
    expect(await store.claim(conversation.id, "owner", request)).toBeNull();
    const turn = {
      ...saved("Audio"),
      requestId: request.requestId,
      message: request.message,
    };
    await store.finish(conversation.id, "owner", turn);
    expect(await store.claim(conversation.id, "owner", request)).toEqual(turn);
    for (const changed of [
      { ...request, followupRequestId: randomUUID() },
      input(request.message),
    ]) {
      await expect(
        store.claim(conversation.id, "owner", {
          ...changed,
          requestId: request.requestId,
        }),
      ).rejects.toMatchObject({ code: "careos_request_conflict" });
    }
    expect((await store.get(conversation.id, "owner")).turns).toEqual([turn]);
  });

  it("accepts no browser query/history/result authority alongside the UUID", () => {
    const request = {
      ...input("Chart those"),
      followupRequestId: randomUUID(),
    };
    for (const extra of [
      { history: [saved("Audio")] },
      { query: emptyRecordsQuery(day) },
      { previousQuery: emptyRecordsQuery(day) },
      { recordsResult: saved("Audio").answer.recordsResult },
    ])
      expect(turnSchema.safeParse({ ...request, ...extra }).success).toBe(
        false,
      );
    for (const followupRequestId of [null, "", "/vault/example", {}, []])
      expect(
        turnSchema.safeParse({ ...request, followupRequestId }).success,
      ).toBe(false);
  });
});
