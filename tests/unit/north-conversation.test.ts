import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerConversationTurn,
  conversationPlanSchema,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { answerRecordsTurn } from "../../src/lib/careos/records/service";
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
describe("model-first conversation, with application-owned facts and no keyword admission", () => {
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
      JSON.parse(next.interpret.mock.calls[0][0]).previous.records,
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
