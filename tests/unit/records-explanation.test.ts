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
      "Sample recorded-value comparison: current $149.00 (1 priced, 1 excluded), previous $89.00 (1 priced, 0 excluded); difference +$60.00.",
    );
    expect(answer.steps[1]).toContain(
      "Verified Sandbox recorded-value comparison: current $20.00 (1 priced, 0 excluded), previous $30.00 (1 priced, 1 excluded); difference −$10.00.",
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
      "Sample recorded-value comparison: current $0.00 (0 priced, 0 excluded), previous $89.00 (1 priced, 1 excluded); difference −$89.00.",
    );
    expect(answer.steps[1]).toContain(
      "Verified Sandbox recorded-value comparison: current $0.00 (0 priced, 0 excluded), previous $30.00 (1 priced, 1 excluded); difference −$30.00.",
    );
    expect(answer.recordsResult?.comparison).toBe(result.comparison);
    expect(answer.sources).toEqual([]);
    expect(answer.actions).toEqual([]);
  });
});
