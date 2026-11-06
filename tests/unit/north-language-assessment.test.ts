import { describe, expect, it } from "vitest";
import {
  assessLanguageAnswer,
  expectedLanguageRecords,
  type LanguageObservation,
  type NativeReadback,
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
    } satisfies LanguageObservation,
  };
}
const currentRequestId = "00000000-0000-4000-8000-000000000901";
function chartResult() {
  const { answer, observed: base } = result();
  answer.recordsResult!.query.format = "chart";
  const nativeReadback: NativeReadback = {
    requestId: currentRequestId,
    executionGeneration: 2,
    state: {
      selectedPageId: "purchases",
      pages: [
        {
          id: "purchases",
          widgets: {
            "extra-recorded-value-chart": {
              type: "bar-chart-grouped",
              dataMapping: {
                categoryKey: [{ id: "purchases.category" }],
                valueKey: ["sample", "sandbox"].map((origin) => ({
                  id: `purchases.${origin}Usd`,
                  aggregation: "sum",
                })),
              },
            },
            ...Object.fromEntries(
              ["sample", "sandbox"].map((origin) => [
                `extra-${origin}-value`,
                {
                  type: "value",
                  dataMapping: {
                    value: [
                      { id: `purchases.${origin}Usd`, aggregation: "sum" },
                    ],
                  },
                },
              ]),
            ),
          },
          filter: {
            page: [
              {
                field: { id: "purchases.id" },
                model: {
                  operator: "OR",
                  conditions: snapshot.map((r) => ({
                    operator: "equals",
                    value: r.id,
                  })),
                },
              },
            ],
          },
          selection: { type: "widget", id: "extra-recorded-value-chart" },
          widgetLayout: Object.fromEntries(
            ["recorded-value-chart", "sample-value", "sandbox-value"].map(
              (id, n) => [
                `extra-${id}`,
                { xTrack: 0, yTrack: n * 8, xSpan: 24, ySpan: 8 },
              ],
            ),
          ),
        },
      ],
    },
    recordIds: snapshot.map((r) => r.id),
    nativeDisplaysVerified: true,
  };
  const observed: LanguageObservation = {
    ...base,
    requestId: currentRequestId,
    nativeReadback,
  };
  return {
    answer,
    observed,
    nativeReadback,
    goal: { ...languageGoals[6], format: "chart" as const },
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
  it("requires current request proof even when prior native content is identical", () => {
    const { goal, answer, observed, nativeReadback } = chartResult();
    expect(
      assessLanguageAnswer(goal, snapshot, answer, observed).automatedPass,
    ).toBe(true);
    nativeReadback.requestId = "00000000-0000-4000-8000-000000000900";
    const assessment = assessLanguageAnswer(goal, snapshot, answer, observed);
    expect(assessment.automatedPass).toBe(false);
    expect(assessment.failures).toEqual([
      "Fresh native proof for exact request",
    ]);
  });
  it("fails closed for absent request correlation or execution generation", () => {
    for (const missing of [
      "expected",
      "request",
      "generation",
      "zero-generation",
    ] as const) {
      const { goal, answer, observed, nativeReadback } = chartResult();
      if (missing === "expected") delete observed.requestId;
      if (missing === "request")
        Reflect.deleteProperty(nativeReadback, "requestId");
      if (missing === "generation") delete nativeReadback.executionGeneration;
      if (missing === "zero-generation") nativeReadback.executionGeneration = 0;
      expect(
        assessLanguageAnswer(goal, snapshot, answer, observed).failures,
      ).toContain("Fresh native proof for exact request");
    }
  });
  it("never lets fresh identity replace exact SDK, record, mapping and layout checks", () => {
    const { goal, answer, observed, nativeReadback } = chartResult();
    nativeReadback.recordIds = [snapshot[0].id];
    const page = nativeReadback.state.pages![0];
    page.selection!.id = "wrong-chart";
    page.widgets![
      "extra-recorded-value-chart"
    ].dataMapping!.valueKey[0].aggregation = "count";
    page.widgetLayout!["extra-sample-value"].xSpan = 25;
    expect(
      assessLanguageAnswer(goal, snapshot, answer, observed).failures,
    ).toEqual(
      expect.arrayContaining([
        "Native SDK/data postconditions, not success text",
        "Exact native ID filter and selection",
        "Native provenance mappings and sums",
        "Native widgets have valid layout",
      ]),
    );
  });
  it("matches literal receipt/price absence and not invented financial values", () => {
    expect(
      expectedLanguageRecords(snapshot, languageGoals[4]).map((r) => r.id),
    ).toEqual([snapshot[0].id, snapshot[2].id]);
    expect(expectedLanguageRecords(snapshot, languageGoals[5])).toEqual([
      snapshot[2],
    ]);
  });
  it("requires the exact context purchase's receipt, not another qualifying purchase's", () => {
    const { answer, observed } = result();
    const purchases: SavedRecord[] = [
      { ...snapshot[0], receiptId: "00000000-0000-4000-8000-000000000402" },
      snapshot[1],
    ];
    const goal = {
      ...languageGoals.find((g) => g.id === "receipt")!,
      filter: { search: "headphones" },
    };
    answer.context = {
      twinId: purchases[0].id,
      name: purchases[0].name,
      model: purchases[0].model,
      origin: purchases[0].origin,
      purchasedOn: purchases[0].purchasedOn,
    };
    answer.actions = [
      {
        label: "Open receipt",
        href: `/documents/${purchases[0].receiptId}`,
      },
    ];
    expect(
      assessLanguageAnswer(goal, purchases, answer, observed).automatedPass,
    ).toBe(true);
    answer.actions[0].href = `/documents/${purchases[1].receiptId}`;
    expect(
      assessLanguageAnswer(goal, purchases, answer, observed).failures,
    ).toEqual(["Exact saved receipt, not substituted"]);
    // A source link cannot substitute the other purchase's receipt either.
    answer.actions = [];
    answer.sources = [
      {
        id: purchases[1].receiptId!,
        title: "Receipt",
        label: "Saved receipt",
        href: `/documents/${purchases[1].receiptId}`,
      },
    ];
    expect(
      assessLanguageAnswer(goal, purchases, answer, observed).failures,
    ).toEqual(["Exact saved receipt, not substituted"]);
    purchases[0].receiptId = null;
    expect(
      assessLanguageAnswer(goal, purchases, answer, observed).failures,
    ).toEqual(["Exact saved receipt, not substituted"]);
  });
});
