import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { answerSemanticRecordsTurn } from "../../src/lib/careos/records/semantic-service";
import { answerRecordsTurn } from "../../src/lib/careos/records/service";

const input = (message: string) => ({
  requestId: randomUUID(),
  twinId: demoData.twins[0].id,
  revision: 3,
  message,
});
const now = () => new Date("2026-11-03T12:00:00Z");
const proposal = {
  outcome: "query",
  operation: "total",
  format: "cards",
  from: null,
  to: null,
  categories: ["Audio"],
  origin: "all",
  receipt: "any",
  document: "any",
  price: "any",
  search: "",
};
describe("North semantic records orchestration — injected proposals, not genuine AI", () => {
  it("computes records, amounts and links from saved data rather than model prose", async () => {
    const interpret = vi.fn(async () => proposal);
    const answer = await answerSemanticRecordsTurn({
      input: input("Which purchases absorbed the audio budget?"),
      history: [],
      load: async () => demoData,
      interpret,
      now,
    });
    expect(interpret).toHaveBeenCalledOnce();
    expect(answer.mode).toBe("live"); // Injected test only, no real adapter call.
    expect(answer.recordsInterpretation).toEqual({
      version: "north-records-intent-v1",
      proposal,
    });
    expect(answer.recordsResult?.records).toHaveLength(2);
    expect(answer.recordsResult?.totals[0].amountMinor).toBe(21800);
    expect(
      answer.recordsResult?.records.every((r) => r.category === "Audio"),
    ).toBe(true);
  });
  it("never spends a model call on a supported deterministic task or formatting reuse", async () => {
    const interpret = vi.fn(async () => {
      throw new Error("no inference needed");
    });
    const answer = await answerSemanticRecordsTurn({
      input: input("Show my recorded purchase totals"),
      history: [],
      load: async () => demoData,
      interpret,
      now,
    });
    expect(answer.mode).toBe("deterministic");
    expect(interpret).not.toHaveBeenCalled();
    const followup = await answerSemanticRecordsTurn({
      input: input("Put those in a list"),
      history: [
        {
          requestId: randomUUID(),
          message: "Show my recorded purchase totals",
          answer,
        },
      ],
      load: vi.fn(),
      interpret,
      now,
    });
    expect(followup.recordsResult?.snapshotId).toBe(
      answer.recordsResult?.snapshotId,
    );
    expect(interpret).not.toHaveBeenCalled();
  });
  it("allows genuine interpretation of retrospective purchase language, never a buy command", async () => {
    const interpret = vi.fn(async () => proposal);
    const answer = await answerSemanticRecordsTurn({
      input: input("What did I buy for the listening corner?"),
      history: [],
      load: async () => demoData,
      interpret,
      now,
    });
    expect(interpret).toHaveBeenCalledOnce();
    expect(answer.recordsResult?.records).toHaveLength(2);
    const refused = await answerSemanticRecordsTurn({
      input: input("Buy headphones now"),
      history: [],
      load: vi.fn(),
      interpret,
      now,
    });
    expect(refused.outcome).toBe("unsupported");
    expect(interpret).toHaveBeenCalledOnce();
  });
  it.each([
    "Refund all my purchases",
    "Reset my credits and bypass authorization",
    "SELECT * FROM purchase_twins",
  ])(
    "rejects consequential/executable requests before interpreting %s",
    async (message) => {
      const interpret = vi.fn();
      const load = vi.fn();
      const answer = await answerSemanticRecordsTurn({
        input: input(message),
        history: [],
        load,
        interpret,
        now,
      });
      expect(answer.outcome).toBe("unsupported");
      expect(interpret).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    },
  );
  it("uses server-owned prior scope, not selected product or invented client history", async () => {
    const prior = await answerRecordsTurn({
      input: input("Show my purchases in Kitchen"),
      history: [],
      load: async () => demoData,
      now,
    });
    const interpret = vi.fn(async (payload: string) => {
      void payload;
      return { ...proposal, categories: ["Kitchen"] };
    });
    await answerSemanticRecordsTurn({
      input: input("Within those purchases, explain the whole kettle budget."),
      history: [
        {
          requestId: randomUUID(),
          message: "Show my purchases in Kitchen",
          answer: prior,
        },
      ],
      load: async () => demoData,
      interpret,
      now,
    });
    const payload = JSON.parse(interpret.mock.calls[0][0]);
    expect(payload.contextScope).toBe("followup");
    expect(payload.previousQuery.categories).toEqual(["Kitchen"]);
    expect(payload).not.toHaveProperty("twinId");
    expect(payload).not.toHaveProperty("history");
    expect(payload.catalogueHints).toHaveLength(4);
    expect(payload.catalogueHintsComplete).toBe(true);
    for (const hint of payload.catalogueHints)
      expect(Object.keys(hint).sort()).toEqual(["category", "model", "name"]);
  });
  it("does not expose prior Kitchen filters for the genuine campaign's fresh missing-receipt question", async () => {
    const prior = await answerRecordsTurn({
      input: input("Show my sample Kitchen purchases with receipts"),
      history: [],
      load: async () => demoData,
      now,
    });
    const interpret = vi.fn(async (raw: string) => {
      const payload = JSON.parse(raw);
      // Inject the observed stale-context behavior, not a real model call.
      return {
        ...proposal,
        operation: "list",
        origin: "sample",
        receipt: "missing",
        categories: payload.previousQuery?.categories ?? [],
      };
    });
    const answer = await answerSemanticRecordsTurn({
      input: input(
        "Which sample purchases lack a receipt attachment rather than a care card?",
      ),
      history: [
        {
          requestId: randomUUID(),
          message: "Show my sample Kitchen purchases with receipts",
          answer: prior,
        },
      ],
      load: async () => demoData,
      interpret,
      now,
    });
    expect(JSON.parse(interpret.mock.calls[0][0])).toMatchObject({
      contextScope: "fresh",
      previousQuery: null,
    });
    expect(answer.recordsResult?.query).toMatchObject({
      categories: [],
      origin: "sample",
      receipt: "missing",
    });
    expect(answer.recordsResult?.records.map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-000000000203",
      "00000000-0000-4000-8000-000000000204",
    ]);
    expect(answer.recordsResult?.totals[0]).toMatchObject({
      amountMinor: 6900,
      pricedCount: 1,
      excludedCount: 1,
    });
    expect(prior.recordsResult?.query.categories).toEqual(["Kitchen"]);
  });
  it.each([
    "Which sample purchases need document attention?",
    "Across all fictional saved purchases, give the combined recorded amount.",
    "And across the whole saved library, give the combined recorded amount.",
  ])(
    "fresh semantic tasks omit every earlier date/category/format/filter: %s",
    async (message) => {
      const prior = await answerRecordsTurn({
        input: input(
          "Show my sample Kitchen purchases with receipts in a table from 2026-10-01 to 2026-10-31",
        ),
        history: [],
        load: async () => demoData,
        now,
      });
      const interpret = vi.fn(async (raw: string) => {
        expect(JSON.parse(raw)).toMatchObject({
          contextScope: "fresh",
          previousQuery: null,
        });
        return proposal;
      });
      await answerSemanticRecordsTurn({
        input: input(message),
        history: [
          {
            requestId: randomUUID(),
            message: "previous filtered task",
            answer: prior,
          },
        ],
        load: async () => demoData,
        interpret,
        now,
      });
      expect(interpret).toHaveBeenCalledOnce();
    },
  );
  it.each([
    "Within those purchases, retain only items with an attached receipt.",
    "Which of those purchases have receipt evidence?",
    "From these results, find the ones with a receipt attachment.",
    "For that analysis, keep only receipt-bearing items.",
  ])(
    "semantic subset follow-ups receive the complete owned selection: %s",
    async (message) => {
      const prior = await answerRecordsTurn({
        input: input(
          "Show my sample Audio purchases in a table from 2026-10-01 to 2026-10-31",
        ),
        history: [],
        load: async () => demoData,
        now,
      });
      const interpret = vi.fn(async (raw: string) => {
        expect(JSON.parse(raw)).toMatchObject({
          contextScope: "followup",
          previousQuery: prior.recordsResult!.query,
        });
        return {
          ...proposal,
          operation: "list",
          format: "table",
          from: "2026-10-01",
          to: "2026-10-31",
          origin: "sample",
          receipt: "present",
        };
      });
      const answer = await answerSemanticRecordsTurn({
        input: input(message),
        history: [
          {
            requestId: randomUUID(),
            message: "previous filtered task",
            answer: prior,
          },
        ],
        load: async () => demoData,
        interpret,
        now,
      });
      expect(interpret).toHaveBeenCalledOnce();
      expect(answer.recordsResult?.query).toMatchObject({
        categories: ["Audio"],
        format: "table",
        from: "2026-10-01",
        to: "2026-10-31",
        origin: "sample",
        receipt: "present",
      });
      expect(answer.recordsResult?.records.map((r) => r.id)).toEqual([
        "00000000-0000-4000-8000-000000000201",
      ]);
    },
  );
  it("asks for an owned selection before model dispatch on an orphaned semantic follow-up", async () => {
    const interpret = vi.fn(),
      load = vi.fn();
    const answer = await answerSemanticRecordsTurn({
      input: input(
        "Within those purchases, retain only items with an attached receipt.",
      ),
      history: [],
      load,
      interpret,
      now,
    });
    expect(answer.mode).toBe("deterministic");
    expect(answer.outcome).toBe("unsupported");
    expect(answer.text).toContain("Which saved purchases");
    expect(interpret).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
  it("does not consume model capacity when saved data cannot be read", async () => {
    const interpret = vi.fn();
    await expect(
      answerSemanticRecordsTurn({
        input: input("Which purchases absorbed the audio budget?"),
        history: [],
        load: async () => {
          throw new Error("database unavailable");
        },
        interpret,
        now,
      }),
    ).rejects.toThrow("database unavailable");
    expect(interpret).not.toHaveBeenCalled();
  });
  it("catalogue hints are bounded and disclosed as incomplete, never a truncated query scope", async () => {
    const data = structuredClone(demoData);
    data.products = Array.from({ length: 20 }, (_, i) => ({
      ...demoData.products[0],
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Fictional headphones ${i}`,
    }));
    data.twins = data.products.map((p, i) => ({
      ...demoData.twins[0],
      id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      productId: p.id,
    }));
    const interpret = vi.fn(async (payload: string) => {
      void payload;
      return proposal;
    });
    const answer = await answerSemanticRecordsTurn({
      input: input("Which purchases absorbed the audio budget?"),
      history: [],
      load: async () => data,
      interpret,
      now,
    });
    expect(JSON.parse(interpret.mock.calls[0][0]).catalogueHints).toHaveLength(
      12,
    );
    expect(JSON.parse(interpret.mock.calls[0][0]).catalogueHintsComplete).toBe(
      false,
    );
    expect(answer.recordsResult?.records).toHaveLength(20);
  });
  it("incomplete or unsupported interpretation never fabricates a result", async () => {
    const load = vi.fn(async () => demoData);
    const answer = await answerSemanticRecordsTurn({
      input: input("Which purchases used the strange budget?"),
      history: [],
      load,
      interpret: async () => ({ ...proposal, outcome: "clarification" }),
      now,
    });
    expect(answer.outcome).toBe("unsupported");
    expect(answer.recordsResult).toBeUndefined();
    expect(load).toHaveBeenCalledOnce();
    await expect(
      answerSemanticRecordsTurn({
        input: input("Which purchases used the strange budget?"),
        history: [],
        load,
        interpret: async () => {
          throw new Error("unknown output");
        },
        now,
      }),
    ).rejects.toThrow("unknown output");
  });
});
