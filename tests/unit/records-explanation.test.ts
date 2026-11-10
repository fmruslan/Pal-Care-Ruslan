import { describe, expect, it } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  emptyRecordsQuery,
  type RecordsResult,
  type SavedRecord,
} from "../../src/lib/careos/records/contracts";
import {
  querySavedRecords,
  recordsAnswer,
  recordTotals,
} from "../../src/lib/careos/records/service";

const day = "2026-11-03";
const observedAt = `${day}T12:00:00Z`;

// Synthetic saved-record projections only, not provider/payment evidence.
function record(
  id: number,
  origin: SavedRecord["origin"],
  amountMinor: number | null,
  purchasedOn: string,
): SavedRecord {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    name: "Test purchase",
    model: "Test model",
    category: "Audio",
    purchasedOn,
    origin,
    amountMinor,
    receiptId: null,
    documents: [],
  };
}

function comparisonResult(
  current: SavedRecord[],
  previous: SavedRecord[],
): RecordsResult {
  const result = querySavedRecords(
    demoData,
    {
      ...emptyRecordsQuery(day),
      operation: "compare",
      from: "2026-11-01",
      to: day,
    },
    observedAt,
    { from: "2026-10-01", to: "2026-10-31" },
  );
  return {
    ...result,
    coverage: {
      ...result.coverage,
      availableCount: current.length + previous.length,
    },
    records: current,
    totals: recordTotals(current),
    groups: current.length
      ? [
          {
            label: "Audio",
            totals: recordTotals(current),
            recordIds: current.map((r) => r.id),
          },
        ]
      : [],
    comparison: {
      ...result.comparison!,
      records: previous,
      totals: recordTotals(previous),
    },
  };
}

describe("grounded saved-record explanations — pure presentation", () => {
  it.each(["table", "chart", "bullets"] as const)(
    "uses exactly two concise provenance bullets without changing the %s records or query",
    (format) => {
      const result = querySavedRecords(
        demoData,
        {
          ...emptyRecordsQuery(day),
          operation: format === "chart" ? "breakdown" : "total",
          format,
        },
        observedAt,
      );
      const before = JSON.stringify(result);
      const answer = recordsAnswer(result, 2, false, "concise");

      expect(answer.steps).toEqual([
        "Sample: $307.00 (3 priced, 1 excluded).",
        "Verified Sandbox: $0.00 (0 priced, 0 excluded).",
      ]);
      expect(answer.text).toContain("unknown is not zero");
      expect(answer.text).toContain(
        "Purchases without a saved price are excluded from amounts",
      );
      expect(answer.text).not.toMatch(
        /refund (?:issued|completed)|payment (?:sent|captured)/i,
      );
      expect(result.records).toHaveLength(4);
      expect(
        result.records.find((r) => r.name === "Raspberry Pi 5"),
      ).toMatchObject({ amountMinor: null });
      expect(answer.recordsResult).toBe(result);
      expect(answer.recordsResult?.query.format).toBe(format);
      expect(JSON.stringify(result)).toBe(before);
      expect(answer.sources).toEqual([]);
      expect(answer.actions).toEqual([]);
    },
  );

  it("places applied category, provenance, dates and evidence scope before the count", () => {
    const result = querySavedRecords(
      demoData,
      {
        ...emptyRecordsQuery(day),
        categories: ["Audio"],
        origin: "sample",
        from: "2026-10-01",
        to: day,
        receipt: "missing",
        document: "present",
        price: "present",
        search: "speaker",
      },
      observedAt,
    );
    const before = JSON.stringify(result);
    const answer = recordsAnswer(result, 2, false, "scope-first");

    expect(
      answer.text.startsWith(
        'Showing: Audio only; Sample only; 2026-10-01 through 2026-11-03 (inclusive; UTC); receipts: missing; saved documents: present; recorded price: present; search: "speaker". 1 matching saved purchase',
      ),
    ).toBe(true);
    expect(answer.recordsResult).toBe(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("states all-saved scope first when no category, provenance or date filter applies", () => {
    const result = querySavedRecords(
      demoData,
      emptyRecordsQuery(day),
      observedAt,
    );
    const answer = recordsAnswer(result, 2, false, "scope-first");

    expect(
      answer.text.startsWith(
        "Showing: all saved purchases; Sample and Verified Sandbox; all saved dates. 4 matching saved purchases",
      ),
    ).toBe(true);
  });

  it.each(["concise", "scope-first"] as const)(
    "retains partial-coverage and comparison evidence in %s presentation",
    (presentation) => {
      const result = comparisonResult(
        [
          record(1, "sample", 14900, "2026-11-02"),
          record(2, "sample", null, "2026-11-02"),
          record(3, "sandbox", 2000, "2026-11-02"),
        ],
        [
          record(4, "sample", 8900, "2026-10-02"),
          record(5, "sandbox", 3000, "2026-10-02"),
          record(6, "sandbox", null, "2026-10-02"),
        ],
      );
      result.coverage.complete = false;
      const before = JSON.stringify(result);
      const answer = recordsAnswer(result, 2, false, presentation);
      const steps = answer.steps.join(" ");

      expect(answer.text).toContain("2026-11-01 through 2026-11-03");
      expect(answer.text).toContain("2026-10-01 through 2026-10-31");
      expect(answer.text).toContain(
        presentation === "concise"
          ? "Some saved purchases are unavailable, so these totals may be incomplete"
          : "global totals are not established",
      );
      expect(steps).toContain("$149.00 (1 priced, 1 excluded)");
      expect(steps).toContain(
        "2026-10-01 through 2026-10-31: $89.00 (1 priced, 0 excluded)",
      );
      expect(steps).toContain(
        "2026-11-01 through 2026-11-03 had $60.00 more recorded Sample value",
      );
      expect(steps).toContain("$20.00 (1 priced, 0 excluded)");
      expect(steps).toContain(
        "2026-10-01 through 2026-10-31: $30.00 (1 priced, 1 excluded)",
      );
      expect(steps).toContain(
        "2026-10-01 through 2026-10-31 had $10.00 more recorded Verified Sandbox value",
      );
      expect(`${answer.text} ${steps}`).toContain(
        presentation === "concise"
          ? "not your complete account history or the reason for a change"
          : "does not establish a cause",
      );
      if (presentation === "concise") expect(answer.steps).toHaveLength(2);
      expect(answer.recordsResult).toBe(result);
      expect(JSON.stringify(result)).toBe(before);
    },
  );

  it("keeps an empty partial comparison and zero-prior warning within two concise bullets", () => {
    const result = comparisonResult(
      [],
      [
        record(1, "sample", null, "2026-10-02"),
        record(2, "sandbox", 3000, "2026-10-02"),
      ],
    );
    result.coverage.complete = false;
    const answer = recordsAnswer(result, 2, true, "concise");

    expect(answer.steps).toEqual([
      "Sample: 2026-11-01 through 2026-11-03: $0.00 (0 priced, 0 excluded); 2026-10-01 through 2026-10-31: $0.00 (0 priced, 1 excluded). Both periods have equal recorded Sample value.",
      "Verified Sandbox: 2026-11-01 through 2026-11-03: $0.00 (0 priced, 0 excluded); 2026-10-01 through 2026-10-31: $30.00 (1 priced, 0 excluded). 2026-10-01 through 2026-10-31 had $30.00 more recorded Verified Sandbox value than 2026-11-01 through 2026-11-03.",
    ]);
    expect(answer.text).toContain(
      "Some saved purchases are unavailable, so these totals may be incomplete",
    );
    expect(answer.text).toContain(
      "A percentage change cannot be calculated from a zero starting amount",
    );
    expect(answer.text).not.toContain("No saved purchases match");
    expect(answer.recordsResult?.comparison).toBe(result.comparison);
  });

  it("states the applied Audio-only category without implying Kitchen is selected", () => {
    const result = querySavedRecords(
      demoData,
      {
        ...emptyRecordsQuery(day),
        categories: ["Audio"],
        origin: "sample",
        from: "2026-10-01",
        to: day,
      },
      observedAt,
    );
    const before = JSON.stringify(result);
    const answer = recordsAnswer(result, 2, true);

    expect(answer.text).toContain("The current selection is Audio only.");
    expect(answer.text).toContain("2026-10-01 through 2026-11-03");
    expect(answer.text).toContain("Sample recorded amounts total $218.00");
    expect(answer.text).toContain(
      "Verified Sandbox recorded amounts total $0.00",
    );
    expect(answer.text).not.toContain("Kitchen");
    expect(result.records.length).toBeGreaterThan(0);
    expect(
      result.records.every(
        (record) => record.category === "Audio" && record.origin === "sample",
      ),
    ).toBe(true);
    expect(answer.recordsResult).toBe(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("qualifies an empty selection when saved-library coverage is partial", () => {
    const result = querySavedRecords(
      demoData,
      { ...emptyRecordsQuery(day), search: "unmatched product" },
      observedAt,
    );
    result.coverage.complete = false;
    const before = JSON.stringify(result);
    const answer = recordsAnswer(result, 2, true);

    expect(answer.text).toContain("No matches in the available saved records");
    expect(answer.text).toContain("other records may be unavailable");
    expect(answer.text).toContain("not complete-library totals");
    expect(answer.text).not.toContain(
      "No saved purchases match those filters.",
    );
    expect(answer.recordsResult).toBe(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("explains both periods separately by provenance with exact differences and exclusions", () => {
    const result = comparisonResult(
      [
        record(1, "sample", 14900, "2026-11-02"),
        record(2, "sample", null, "2026-11-02"),
        record(3, "sandbox", 2000, "2026-11-02"),
      ],
      [
        record(4, "sample", 8900, "2026-10-02"),
        record(5, "sandbox", 3000, "2026-10-02"),
        record(6, "sandbox", null, "2026-10-02"),
      ],
    );
    const before = JSON.stringify(result);
    const answer = recordsAnswer(result, 2, true);

    expect(answer.text).toContain("2026-11-01 through 2026-11-03");
    expect(answer.text).toContain("2026-10-01 through 2026-10-31");
    expect(answer.text).toContain("unpriced/reference records are excluded");
    expect(answer.steps[0]).toContain(
      "Sample recorded-value comparison: 2026-11-01 through 2026-11-03: $149.00 (1 priced, 1 excluded); 2026-10-01 through 2026-10-31: $89.00 (1 priced, 0 excluded). 2026-11-01 through 2026-11-03 had $60.00 more recorded Sample value",
    );
    expect(answer.steps[1]).toContain(
      "Verified Sandbox recorded-value comparison: 2026-11-01 through 2026-11-03: $20.00 (1 priced, 0 excluded); 2026-10-01 through 2026-10-31: $30.00 (1 priced, 1 excluded). 2026-10-01 through 2026-10-31 had $10.00 more recorded Verified Sandbox value",
    );
    expect(answer.steps[0]).toContain(
      "does not establish a cause or a complete account trend",
    );
    expect(answer.recordsResult).toBe(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("retains nonempty previous-period facts when the current period is empty and coverage is partial", () => {
    const result = comparisonResult(
      [],
      [
        record(1, "sample", 8900, "2026-10-02"),
        record(2, "sample", null, "2026-10-02"),
        record(3, "sandbox", 3000, "2026-10-02"),
        record(4, "sandbox", null, "2026-10-02"),
      ],
    );
    result.coverage.complete = false;
    const answer = recordsAnswer(result, 2, true);

    expect(answer.text).not.toContain("No saved purchases match");
    expect(answer.text).toContain("not complete-library totals");
    expect(answer.steps[0]).toContain(
      "Sample recorded-value comparison: 2026-11-01 through 2026-11-03: $0.00 (0 priced, 0 excluded); 2026-10-01 through 2026-10-31: $89.00 (1 priced, 1 excluded). 2026-10-01 through 2026-10-31 had $89.00 more recorded Sample value",
    );
    expect(answer.steps[1]).toContain(
      "Verified Sandbox recorded-value comparison: 2026-11-01 through 2026-11-03: $0.00 (0 priced, 0 excluded); 2026-10-01 through 2026-10-31: $30.00 (1 priced, 1 excluded). 2026-10-01 through 2026-10-31 had $30.00 more recorded Verified Sandbox value",
    );
    expect(answer.recordsResult?.comparison).toBe(result.comparison);
    expect(answer.sources).toEqual([]);
    expect(answer.actions).toEqual([]);
  });
});
