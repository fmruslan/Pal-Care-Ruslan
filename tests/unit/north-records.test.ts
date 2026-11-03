import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  answerRecordsTurn,
  querySavedRecords,
  recordTotals,
  recordsAnswer,
} from "../../src/lib/careos/records/service";
import {
  emptyRecordsQuery,
  recordsResultSchema,
  type RecordsQuery,
} from "../../src/lib/careos/records/contracts";
import {
  previousPeriod,
  recordsCandidate,
  recordsTaskCandidate,
  recordsQueryContinuation,
  resolveRecordsQuery,
  shiftMonth,
} from "../../src/lib/careos/records/query";
import type { CareTurn } from "../../src/lib/careos/contracts";
import { scriptedCustomerPlan } from "../../src/lib/intelligence/customer-commands";
import {
  northFullDistribution,
  northFullSlots,
} from "../fixtures/north-full-campaign";

const day = "2026-11-03";
const base = () => emptyRecordsQuery(day);
function resolved(message: string, prior?: RecordsQuery) {
  const result = resolveRecordsQuery(message, day, prior);
  if (!result || !("query" in result)) throw new Error(JSON.stringify(result));
  return result.query;
}
const input = (message: string) => ({
  requestId: randomUUID(),
  twinId: demoData.twins[0].id,
  revision: 2,
  message,
});
const now = () => new Date(`${day}T12:00:00Z`);

describe("North saved-record query foundation — provider-free, no financial writes", () => {
  it.each([
    "Which sample purchases lack a receipt attachment rather than a care card?",
    "Retrieve my sample kitchen purchases with a saved receipt attached.",
    "Across all fictional saved purchases, give the combined recorded amount.",
    "And show all my sample purchases",
  ])("fresh scope never inherits the prior selection: %s", (message) => {
    expect(recordsQueryContinuation(message)).toBe(false);
  });
  it.each([
    "Within those purchases, keep only items with a receipt.",
    "Which of those purchases have receipt evidence?",
    "From these results, retain the Audio category.",
    "For that analysis, keep only the priced items.",
    "Put them in a table",
    "Only electronics",
    "Total?",
    "Last month?",
  ])("explicit follow-ups retain applicable owned context: %s", (message) => {
    expect(recordsQueryContinuation(message)).toBe(true);
    expect(recordsCandidate(message, base())).toBe(true);
  });
  it("an explicit all-library task clears prior filters even after a follow-up prefix", () => {
    const prior = resolved(
      "Show my sample Kitchen purchases with receipts in a table from 2026-10-01 to 2026-10-31",
    );
    expect(resolved("And show all my purchases", prior)).toEqual(base());
  });
  it("plain totals after a comparison reuse owned records without retaining an unrequested comparison", async () => {
    const answer = recordsAnswer(
      querySavedRecords(
        demoData,
        resolved("Compare last month with the previous month"),
      ),
      0,
    );
    const load = vi.fn();
    const result = await answerRecordsTurn({
      input: input("Total?"),
      history: [
        {
          requestId: randomUUID(),
          message: "Compare last month with the previous month",
          answer,
        },
      ],
      load,
      now,
    });
    expect(result.recordsResult?.query.operation).toBe("total");
    expect(result.recordsResult?.comparison).toBeNull();
    expect(result.recordsResult?.snapshotId).toBe(
      answer.recordsResult?.snapshotId,
    );
    expect(result.recordsResult?.totals[0].amountMinor).toBe(30700);
    expect(load).not.toHaveBeenCalled();
  });
  it("short formatting of an existing comparison reuses its exact prior-period evidence", async () => {
    const answer = recordsAnswer(
      querySavedRecords(
        demoData,
        resolved("Compare last month with the previous month"),
      ),
      0,
    );
    const load = vi.fn();
    const result = await answerRecordsTurn({
      input: input("Table please"),
      history: [
        {
          requestId: randomUUID(),
          message: "Compare last month with the previous month",
          answer,
        },
      ],
      load,
      now,
    });
    expect(result.recordsResult?.query).toMatchObject({
      operation: "compare",
      format: "table",
    });
    expect(result.recordsResult?.comparison).toEqual(
      answer.recordsResult?.comparison,
    );
    expect(load).not.toHaveBeenCalled();
  });
  it("adding comparison and formatting together cannot reuse a result that has no comparison evidence", async () => {
    const answer = recordsAnswer(
      querySavedRecords(demoData, resolved("Show my purchases last month")),
      0,
    );
    const load = vi.fn(async () => demoData);
    const result = await answerRecordsTurn({
      input: input(
        "Put those results in a table and compare with the previous period",
      ),
      history: [
        {
          requestId: randomUUID(),
          message: "Show my purchases last month",
          answer,
        },
      ],
      load,
      now,
    });
    expect(result.recordsResult?.query).toMatchObject({
      operation: "compare",
      format: "table",
    });
    expect(result.recordsResult?.comparison).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      records: [],
    });
    expect(load).toHaveBeenCalledOnce();
  });
  it("counts all saved records, not catalog prices or reference zero", () => {
    const r = querySavedRecords(demoData, base());
    expect(r.records).toHaveLength(4);
    expect(r.totals).toEqual([
      {
        origin: "sample",
        amountMinor: 30700,
        pricedCount: 3,
        excludedCount: 1,
      },
      { origin: "sandbox", amountMinor: 0, pricedCount: 0, excludedCount: 0 },
    ]);
    expect(r.coverage).toMatchObject({ complete: true, availableCount: 4 });
    expect(r.records.find((r) => r.model === "5")?.amountMinor).not.toBe(0);
  });
  it("a totals request selects an aggregate presentation, including plural totals", () => {
    expect(resolved("Show my recorded purchase totals").operation).toBe(
      "total",
    );
    expect(
      resolved("What is the recorded total for those?", base()).operation,
    ).toBe("total");
  });
  it.each([
    ["Show category chart in this workspace", "category"],
    ["Open the documents view in this workspace", "documents"],
    ["Open the product care view in this workspace", "care"],
  ])(
    "explicit workspace presentation stays on real SDK tools, not the records API: %s",
    (message, operation) => {
      expect(recordsCandidate(message)).toBe(false);
      expect(scriptedCustomerPlan(message)?.commands[0].operation).toBe(
        operation,
      );
    },
  );
  it.each([
    ["Show my purchases", 4],
    ["Find purchases with receipts", 2],
    ["Show my purchases without receipts", 2],
    ["Show my purchases in Electronics", 3],
    ["Show my purchases in Kitchen", 1],
    ["Show my verified Sandbox purchases", 0],
    ["Show my purchases with missing prices", 1],
    ["Show my headphones purchases", 1],
    ["Find my receipts", 2],
    ["Find my purchases with documents", 4],
    ["Find my purchases without documents", 0],
    ["Show my purchases with prices", 3],
    ["Show my purchases without receipts but with documents", 2],
  ])("normalizes and executes %s", (question, count) => {
    expect(
      querySavedRecords(demoData, resolved(question as string)).records,
    ).toHaveLength(count as number);
  });
  it("date selection and totals agree with inspectable records", () => {
    const q = resolved(
      "Show my recorded purchase totals from 2026-10-12 to 2026-10-18",
    );
    const r = querySavedRecords(demoData, q);
    expect(r.records.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Everyday headphones", "Pour-over kettle"]),
    );
    expect(r.totals[0].amountMinor).toBe(23800);
    expect(r.groups.flatMap((g) => g.recordIds).sort()).toEqual(
      r.records.map((r) => r.id).sort(),
    );
  });
  it("library queries do not truncate at the dashboard's 100-record window", () => {
    const data = structuredClone(demoData);
    data.twins = Array.from({ length: 125 }, (_, i) => ({
      ...demoData.twins[0],
      id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const r = querySavedRecords(data, base());
    expect(r.records).toHaveLength(125);
    expect(r.totals[0].amountMinor).toBe(125 * 14900);
    expect(r.coverage.complete).toBe(true);
  });
  it("a bounded 1001st record is disclosed as partial, never a complete global total", () => {
    const data = structuredClone(demoData);
    data.twins = Array.from({ length: 1001 }, (_, i) => ({
      ...demoData.twins[0],
      id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
    const r = querySavedRecords(data, base());
    expect(r.records).toHaveLength(1000);
    expect(r.coverage.complete).toBe(false);
  });
  it("totals for those reuse exact owned records even when the source would change", async () => {
    const first = await answerRecordsTurn({
      input: input("Show my purchases"),
      history: [],
      load: async () => demoData,
      now,
    });
    const load = vi.fn(async () => ({ ...demoData, twins: [] }));
    const r = await answerRecordsTurn({
      input: input("What is the recorded total for those?"),
      history: [
        {
          requestId: randomUUID(),
          message: "Show my purchases",
          answer: first,
        },
      ],
      load,
      now,
    });
    expect(r.recordsResult?.query.operation).toBe("total");
    expect(r.recordsResult?.snapshotId).toBe(first.recordsResult?.snapshotId);
    expect(r.recordsResult?.totals[0].amountMinor).toBe(30700);
    expect(load).not.toHaveBeenCalled();
  });
  it.each([
    ["2024-05-31", -3, "2024-02-29"],
    ["2025-05-31", -3, "2025-02-28"],
    ["2026-01-31", -1, "2025-12-31"],
    ["2026-03-31", -1, "2026-02-28"],
  ])("calendar months clamp %s by %s", (date, shift, expected) => {
    expect(shiftMonth(date as string, shift as number)).toBe(expected);
  });
  it("uses exact complete last-month and rolling-three-month boundaries", () => {
    expect(resolved("What did I buy in the last three months?")).toMatchObject({
      from: "2026-08-03",
      to: day,
      timezone: "UTC",
    });
    expect(resolved("Show my purchases last month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolved("Show my purchases in February 2024")).toMatchObject({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
  it.each([
    "Show my purchases under $100",
    "Show my purchases except Audio",
    "Only toys",
    "Show my purchases in the last 6 months",
    "Show my purchases 2026-02-30 to 2026-03-01",
    "Show my Samsung purchases",
    "Show my purchases in Toys",
    "Show my purchases with receipts and without receipts",
    "Show my purchases last month in March",
  ])("clarifies instead of silently dropping a modifier: %s", (question) => {
    expect(resolveRecordsQuery(question, day, base())).toHaveProperty(
      "clarification",
    );
  });
  it.each([
    "How do I shut down my Pi?",
    "Clean these headphones",
    "Issue a refund for my purchases",
    "Renew my credits",
    "Find my purchases https://evil.test",
  ])(
    "does not admit care, financial, authority or external commands: %s",
    (question) => {
      expect(recordsCandidate(question)).toBe(false);
    },
  );
  it("retains receipt identity and excludes care cards from receipt results", () => {
    const r = querySavedRecords(
      demoData,
      resolved("Find purchases with receipts"),
    );
    for (const record of r.records)
      expect(demoData.documents).toContainEqual(
        expect.objectContaining({
          id: record.receiptId,
          twinId: record.id,
          kind: "receipt",
        }),
      );
    expect(r.records.some((r) => r.name === "Everywhere speaker")).toBe(false);
  });
  it("preserves selected product while global query ignores it", async () => {
    const load = vi.fn(async () => structuredClone(demoData));
    const request = input("Show my recorded purchase totals");
    const before = structuredClone(request);
    const answer = await answerRecordsTurn({
      input: request,
      history: [],
      load,
      now,
    });
    expect(answer).toMatchObject({
      context: null,
      questionScope: "library",
      mode: "deterministic",
    });
    expect(answer.recordsResult?.records).toHaveLength(4);
    expect(request).toEqual(before);
    expect(load).toHaveBeenCalledOnce();
  });
  it("format-only follow-up reuses owned snapshot without retrieving or dispatching", async () => {
    const first = await answerRecordsTurn({
      input: input("Show my purchases"),
      history: [],
      load: async () => demoData,
      now,
    });
    const load = vi.fn(async () => {
      throw new Error("no fresh retrieval");
    });
    const history: CareTurn[] = [
      { requestId: randomUUID(), message: "Show my purchases", answer: first },
    ];
    const follow = await answerRecordsTurn({
      input: input("Put those in a list"),
      history,
      load,
      now,
    });
    expect(follow.recordsResult?.query.format).toBe("bullets");
    expect(follow.recordsResult?.snapshotId).toBe(
      first.recordsResult?.snapshotId,
    );
    expect(follow.recordsResult?.records).toEqual(first.recordsResult?.records);
    expect(load).not.toHaveBeenCalled();
  });
  it("applies category then period follow-ups, but explicit fresh tasks reset inherited filters", () => {
    const selected = resolved("Only electronics", base());
    const period = resolved("What about last month?", selected);
    expect(period).toMatchObject({
      categories: ["Audio", "Computing"],
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolved("Show all my purchases", period)).toMatchObject({
      categories: [],
      from: null,
      to: null,
    });
  });
  it("supports natural short analysis follow-ups from owned history without another retrieval", async () => {
    const first = await answerRecordsTurn({
      input: input("Show my purchases"),
      history: [],
      load: async () => demoData,
      now,
    });
    const history: CareTurn[] = [
      { requestId: randomUUID(), message: "Show my purchases", answer: first },
    ];
    const load = vi.fn();
    const total = await answerRecordsTurn({
      input: input("Total?"),
      history,
      load,
      now,
    });
    expect(total.recordsResult?.query.operation).toBe("total");
    expect(total.recordsResult?.snapshotId).toBe(
      first.recordsResult?.snapshotId,
    );
    expect(resolved("Table please", base()).format).toBe("table");
    expect(resolved("Last month?", base()).from).toBe("2026-10-01");
    expect(resolved("Now just kitchen", base()).categories).toEqual([
      "Kitchen",
    ]);
    expect(load).not.toHaveBeenCalled();
  });
  it("generic care follow-ups stay with the product, while explicit analysis references resume the saved result", () => {
    expect(recordsTaskCandidate("And the button?", base(), true)).toBe(false);
    expect(
      recordsTaskCandidate("And can I disconnect power now?", base(), true),
    ).toBe(false);
    expect(recordsTaskCandidate("And its receipt?", base(), true)).toBe(false);
    expect(recordsTaskCandidate("Put those in a list", base(), true)).toBe(
      false,
    );
    expect(recordsTaskCandidate("Table please", base(), true)).toBe(false);
    expect(recordsTaskCandidate("Only electronics", base(), true)).toBe(true);
    expect(recordsTaskCandidate("What about last month?", base(), true)).toBe(
      true,
    );
    expect(
      recordsTaskCandidate("Put those purchases in a list", base(), true),
    ).toBe(true);
  });
  it("format requests with added filters resolve the entire selection rather than silently reusing it", () => {
    const prior = resolved("Show my purchases");
    const filtered = resolveRecordsQuery(
      "Put those in a list with receipts",
      day,
      prior,
    );
    expect(filtered).toMatchObject({
      reuse: false,
      query: { receipt: "present", format: "bullets" },
    });
    expect(
      querySavedRecords(
        demoData,
        resolved("Put those in a list with receipts", prior),
      ).records,
    ).toHaveLength(2);
    expect(
      resolveRecordsQuery("Put those Samsung purchases in a list", day, prior),
    ).toHaveProperty("clarification");
  });
  it("resolves category unions and both provenances without choosing just the first", () => {
    expect(
      resolved("Show my purchases in Audio and Kitchen").categories,
    ).toEqual(["Audio", "Kitchen"]);
    expect(
      querySavedRecords(
        demoData,
        resolved("Show my purchases in Audio and Kitchen"),
      ).records,
    ).toHaveLength(3);
    expect(resolved("Show my sample and Sandbox purchases").origin).toBe("all");
    expect(resolved("Only headphones", base()).search).toBe("headphones");
  });
  it.each([
    "Show my headphones and kettle purchases",
    "Show my purchases in September and October",
    "Put those in a list with missing model q99",
  ])(
    "clarifies unresolved compound scope without dropping qualifiers: %s",
    (message) => {
      expect(resolveRecordsQuery(message, day, base())).toHaveProperty(
        "clarification",
      );
    },
  );
  it("new topic preserves history but prevents old query inheritance", async () => {
    const first = await answerRecordsTurn({
      input: input("Show my purchases in Kitchen"),
      history: [],
      load: async () => demoData,
      now,
    });
    const history: CareTurn[] = [
      {
        requestId: randomUUID(),
        message: "Show my purchases in Kitchen",
        answer: first,
      },
    ];
    const reset = await answerRecordsTurn({
      input: input("New topic"),
      history,
      load: vi.fn(),
      now,
    });
    const answer = await answerRecordsTurn({
      input: input("Only electronics"),
      history: [
        ...history,
        { requestId: randomUUID(), message: "New topic", answer: reset },
      ],
      load: vi.fn(),
      now,
    });
    expect(answer.recordsResult).toBeUndefined();
    expect(answer.text).toContain("Which saved purchases");
    expect(history).toHaveLength(1);
  });
  it("period comparisons are calendar-aware and have distinct contributing records", () => {
    expect(previousPeriod("2024-03-01", "2024-03-31")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    const r = querySavedRecords(
      demoData,
      resolved("Compare last month with the previous month"),
    );
    expect(r.comparison).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      records: [],
    });
    expect(r.comparison?.totals[0].amountMinor).toBe(0);
    expect(recordsAnswer(r, 1).steps.join(" ")).toContain(
      "Percentage growth from a zero prior value is not established",
    );
    expect(recordsAnswer(r, 1).steps.join(" ")).toContain(
      "difference +$307.00",
    );
  });
  it("describes category patterns from inspectable recorded amounts, not model guesses or catalog prices", () => {
    const result = querySavedRecords(
      demoData,
      resolved("Show my spending patterns"),
    );
    const text = recordsAnswer(result, 1).steps.join(" ");
    expect(text).toContain(
      "Audio has the largest recorded category value ($218.00)",
    );
    expect(text).toContain(
      "$307.00 across 3 priced purchases; 1 unpriced/reference excluded",
    );
    expect(text).toContain("not a reason for spending");
    expect(text).not.toContain("$129.00");
  });
  it("keeps same-product separate purchases while deduplicating repeated IDs", () => {
    const data = structuredClone(demoData);
    data.twins.push({ ...data.twins[0], id: randomUUID() });
    data.twins.push({ ...data.twins[0] });
    const r = querySavedRecords(data, base());
    expect(r.records).toHaveLength(5);
    expect(r.totals[0].amountMinor).toBe(45600);
  });
  it("conflicting purchase evidence cannot establish complete totals", () => {
    const data = structuredClone(demoData);
    data.twins.push({ ...data.twins[0], purchasePriceMinor: 1 });
    const r = querySavedRecords(data, base());
    expect(r.coverage.complete).toBe(false);
    expect(r.records.some((r) => r.id === data.twins[0].id)).toBe(false);
  });
  it("never substitutes a fixture for an unavailable database", async () => {
    await expect(
      answerRecordsTurn({
        input: input("Show my purchases"),
        history: [],
        load: async () => {
          throw new Error("DB unavailable");
        },
        now,
      }),
    ).rejects.toThrow("DB unavailable");
  });
  it("rejects monetary overflow and model/visitor-supplied links", () => {
    const records = querySavedRecords(demoData, base())
      .records.slice(0, 2)
      .map((r) => ({ ...r, amountMinor: Number.MAX_SAFE_INTEGER }));
    expect(() => recordTotals(records)).toThrow("overflow");
    const result = querySavedRecords(demoData, base());
    expect(
      recordsResultSchema.safeParse({
        ...result,
        records: [{ ...result.records[0], href: "javascript:bad" }],
      }).success,
    ).toBe(false);
  });
  it("the new genuine campaign has exactly 200 unique slots, with no completed results imported", () => {
    expect(northFullSlots).toHaveLength(200);
    expect(new Set(northFullSlots.map((s) => s.id)).size).toBe(200);
    expect(
      northFullDistribution.map((g) => g.initial + g.regression + g.final),
    ).toEqual([30, 30, 30, 25, 25, 25, 20, 15]);
    expect(
      ["initial", "regression", "final"].map(
        (w) => northFullSlots.filter((s) => s.wave === w).length,
      ),
    ).toEqual([120, 60, 20]);
    expect(northFullSlots.every((s) => !("completed" in s))).toBe(true);
  });
});
