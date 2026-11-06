import { describe, expect, it } from "vitest";
import {
  assessLanguageAnswer,
  expectedLanguageRecords,
} from "../../scripts/north-language-assessment";
import { languageGoals } from "../fixtures/north-language-library";
import {
  emptyRecordsQuery,
  type SavedRecord,
} from "../../src/lib/careos/records/contracts";
import type { CareAnswer } from "../../src/lib/careos/contracts";
const snapshot: SavedRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000201",
    name: "Headphones",
    model: "F-01",
    category: "Audio",
    purchasedOn: "2026-10-01",
    origin: "sample",
    amountMinor: 14900,
    receiptId: null,
    documents: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    name: "Headphones",
    model: "F-01",
    category: "Audio",
    purchasedOn: "2026-10-02",
    origin: "sandbox",
    amountMinor: 12900,
    receiptId: "00000000-0000-4000-8000-000000000401",
    documents: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000203",
    name: "Raspberry Pi",
    model: "5",
    category: "Computing",
    purchasedOn: "2026-10-03",
    origin: "sample",
    amountMinor: null,
    receiptId: null,
    documents: [],
  },
];
function result() {
  const answer: CareAnswer = {
    outcome: "answered",
    mode: "live",
    revision: 0,
    context: null,
    text: "Saved amounts",
    steps: [],
    actions: [],
    sources: [],
    recordsResult: {
      version: 1,
      snapshotId: "a".repeat(64),
      queryFingerprint: "b".repeat(64),
      observedAt: "2026-11-06T00:00:00.000Z",
      query: { ...emptyRecordsQuery("2026-11-06"), operation: "total" },
      coverage: {
        source: "database",
        complete: true,
        availableCount: 3,
        limit: 1000,
        excludedInvalidCount: 0,
      },
      records: snapshot,
      totals: [
        {
          origin: "sample",
          amountMinor: 14900,
          pricedCount: 1,
          excludedCount: 1,
        },
        {
          origin: "sandbox",
          amountMinor: 12900,
          pricedCount: 1,
          excludedCount: 0,
        },
      ],
      groups: [],
      comparison: null,
    },
  };
  return {
    answer,
    observed: {
      text: answer.text,
      renderedIds: snapshot.map((r) => r.id),
      linksResolve: true,
      nativeReadback: null,
      applicationErrors: [],
      forbiddenRequests: [],
    },
  };
}
describe("independent North oracle negative controls", () => {
  it("excludes unknown prices while separating exact provenance", () => {
    const { answer, observed } = result();
    expect(
      assessLanguageAnswer(languageGoals[6], snapshot, answer, observed)
        .automatedPass,
    ).toBe(true);
    answer.recordsResult!.totals[0].amountMinor += 12900;
    expect(
      assessLanguageAnswer(languageGoals[6], snapshot, answer, observed)
        .failures,
    ).toContain("sample exact minor-unit total and exclusions");
  });
  it("rejects stale-filter IDs and changed dates, even when the prose looks right", () => {
    const { answer, observed } = result();
    answer.recordsResult!.records = [
      { ...snapshot[0], purchasedOn: "2026-01-01" },
    ];
    expect(
      assessLanguageAnswer(languageGoals[6], snapshot, answer, observed)
        .failures,
    ).toEqual(
      expect.arrayContaining([
        "Exact independent record IDs",
        "Original record facts unchanged",
      ]),
    );
  });
  it("never treats a chart success string alone as actual SDK proof", () => {
    const { answer, observed } = result();
    const goal = { ...languageGoals[6], format: "chart" as const };
    answer.recordsResult!.query.format = "chart";
    observed.text += " Native chart verified";
    expect(
      assessLanguageAnswer(goal, snapshot, answer, observed).failures,
    ).toContain("Native SDK/data postconditions, not success text");
  });
  it("matches literal receipt/price absence and not invented financial values", () => {
    expect(
      expectedLanguageRecords(snapshot, languageGoals[4]).map((r) => r.id),
    ).toEqual([snapshot[0].id, snapshot[2].id]);
    expect(expectedLanguageRecords(snapshot, languageGoals[5])).toEqual([
      snapshot[2],
    ]);
  });
});
