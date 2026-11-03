import { describe, expect, it } from "vitest";
import {
  interpretedRecordsQuery,
  recordsInterpretationSchema,
  RECORDS_INTERPRETATION_VERSION,
  RECORDS_INTERPRETATION_INSTRUCTIONS,
  RECORDS_INTERPRETATION_DEFAULTS,
} from "../../src/lib/careos/records/interpretation";

// Schema/security preparation only: no provider call and no campaign completion.
const proposal = {
  outcome: "query",
  operation: "breakdown",
  format: "chart",
  from: "2026-10-01",
  to: "2026-10-31",
  categories: ["Audio", "Computing"],
  origin: "all",
  receipt: "any",
  document: "any",
  price: "any",
  search: "",
};
describe("protected semantic-query proposal boundary", () => {
  it("fixes reference date/timezone server-side and permits no model facts/authority", () => {
    expect(interpretedRecordsQuery(proposal, "2026-11-03")).toMatchObject({
      referenceDate: "2026-11-03",
      timezone: "UTC",
      operation: "breakdown",
      format: "chart",
    });
    for (const extra of [
      { amountMinor: 30700 },
      { href: "https://evil.example" },
      { recordIds: ["forged"] },
      { resetBudget: true },
      { timezone: "forged" },
    ])
      expect(
        recordsInterpretationSchema.safeParse({ ...proposal, ...extra })
          .success,
      ).toBe(false);
  });
  it.each([
    "https://evil.example",
    "javascript:alert(1)",
    "select * from purchase_twins",
    "<script>",
    "data:text/plain,redirect",
    "00000000-0000-4000-8000-000000000201",
  ])("rejects executable/external search proposal %s", (search) => {
    expect(() =>
      interpretedRecordsQuery({ ...proposal, search }, "2026-11-03"),
    ).toThrow();
  });
  it("does not promote an impossible/reversed date, invented category or clarification to execution", () => {
    expect(() =>
      interpretedRecordsQuery(
        { ...proposal, from: "2026-02-30" },
        "2026-11-03",
      ),
    ).toThrow();
    expect(() =>
      interpretedRecordsQuery(
        { ...proposal, from: "2026-12-01" },
        "2026-11-03",
      ),
    ).toThrow();
    expect(() =>
      interpretedRecordsQuery(
        { ...proposal, categories: ["invented"] },
        "2026-11-03",
      ),
    ).toThrow();
    expect(
      interpretedRecordsQuery(
        { ...proposal, outcome: "clarification" },
        "2026-11-03",
      ),
    ).toBeNull();
    expect(() =>
      interpretedRecordsQuery(
        { ...proposal, operation: "compare", from: null, to: null },
        "2026-11-03",
      ),
    ).toThrow();
  });
  it("keeps independent prompt identity and untrusted-source/financial limits explicit", () => {
    expect(RECORDS_INTERPRETATION_VERSION).toBe("north-records-intent-v1");
    expect(RECORDS_INTERPRETATION_INSTRUCTIONS).toContain("untrusted DATA");
    expect(RECORDS_INTERPRETATION_INSTRUCTIONS).toContain(
      "application code resolves all records and computes every number",
    );
    expect(RECORDS_INTERPRETATION_DEFAULTS).toContain("use cards");
    expect(RECORDS_INTERPRETATION_DEFAULTS).toContain("never silently narrow");
  });
});
