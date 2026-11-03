import { describe, expect, it } from "vitest";
import {
  northFullRecordsDrafts,
  NORTH_RECORDS_DRAFT_REFERENCE,
} from "../fixtures/north-full-records-drafts";
import { northFullSlots } from "../fixtures/north-full-campaign";
import { demoData } from "../../src/lib/demo/fixtures";
import { querySavedRecords } from "../../src/lib/careos/records/service";
import {
  recordsRequestAllowed,
  resolveRecordsQuery,
} from "../../src/lib/careos/records/query";
import { inspectDraftOracles } from "../../scripts/preflight-north-full";

describe("draft genuine-case independent saved-record oracles — no provider dispatch/completions", () => {
  it("preflight reports bounds without granting authority or pretending to read/reset a genuine ledger", () => {
    expect(inspectDraftOracles()).toMatchObject({
      registeredSlots: 200,
      preparedDrafts: 36,
      unpreparedSlots: 164,
      conservativeDraftAttemptBound: 72,
      dispatchesByThisCommand: 0,
      genuineLedgerReviewed: false,
      frozen: false,
      authorizationGranted: false,
      liveBrowserHarnessReady: false,
    });
    expect(inspectDraftOracles()).not.toHaveProperty(
      "genuineEvaluatedCompletions",
    );
  });
  it("uses 36 distinct new initial slots with exact 18-search/18-analytics quotas", () => {
    expect(northFullRecordsDrafts).toHaveLength(36);
    expect(new Set(northFullRecordsDrafts.map((c) => c.message)).size).toBe(36);
    expect(
      northFullRecordsDrafts.every((c) =>
        northFullSlots.some((s) => s.id === c.id),
      ),
    ).toBe(true);
    expect(
      northFullRecordsDrafts.filter((c) => c.category === "purchase-search"),
    ).toHaveLength(18);
    expect(
      northFullRecordsDrafts.filter((c) => c.category === "spending-analytics"),
    ).toHaveLength(18);
  });
  it.each(northFullRecordsDrafts)(
    "literal identity/minor-unit oracle for $id",
    (c) => {
      expect(recordsRequestAllowed(c.message)).toBe(true);
      const result = querySavedRecords(demoData, c.expectedQuery);
      expect(result.records.map((r) => r.id).sort()).toEqual(
        [...c.expectedIds].sort(),
      );
      expect(result.totals[0].amountMinor).toBe(c.expectedSampleMinor);
      expect(result.totals[0].excludedCount).toBe(c.expectedExcluded);
      for (const record of result.records)
        expect(record.amountMinor).toBe(c.expectedRecordValues[record.id]);
      expect(result.totals[1].amountMinor).toBe(0);
      if (c.expectedPreviousPeriod) {
        expect(result.comparison).toMatchObject({
          from: c.expectedPreviousPeriod.from,
          to: c.expectedPreviousPeriod.to,
          records: [],
        });
        expect(result.comparison?.totals[0].amountMinor).toBe(0);
      }
      // These cases require genuine semantic interpretation. They are not redundant
      // model calls attached to an already-resolved deterministic shortcut.
      const resolution = resolveRecordsQuery(
        c.message,
        NORTH_RECORDS_DRAFT_REFERENCE,
      );
      expect(!resolution || "clarification" in resolution).toBe(true);
      expect(c.status).toBe("draft-not-dispatched");
    },
  );
});
