import { describe, it, expect } from "vitest";
import {
  illustrativeDataset,
  filterFacts,
  totals,
  recordedDataset,
} from "../../src/lib/intelligence/model";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { layoutSchema } from "../../src/lib/intelligence/layout";
describe("merchant intelligence provenance and window", () => {
  it("rejects untrusted layout overflow, scripts and arbitrary widget keys", () => {
    expect(layoutSchema.safeParse({ script: "alert(1)" }).success).toBe(false);
    const p = { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 28 };
    expect(
      layoutSchema.safeParse({ recovery: p, status: p, evidence: p }).success,
    ).toBe(true);
    expect(
      layoutSchema.safeParse({
        recovery: { ...p, xSpan: 1000 },
        status: p,
        evidence: p,
      }).success,
    ).toBe(false);
  });
  it("never substitutes illustrative facts for empty recorded data", () => {
    const data = recordedDataset(emptyOverview());
    expect(data.facts).toEqual([]);
    expect(data.allVerifiedMinor).toBe(0);
    expect(data.mode).toBe("recorded");
  });
  it("keeps illustrations non-actionable and separates all six stages", () => {
    expect(
      illustrativeDataset.facts.every(
        (f) => f.href === null && f.evidence === "Illustrative scenario",
      ),
    ).toBe(true);
    const pending = filterFacts(illustrativeDataset.facts, "Pending");
    expect(totals(pending).Verified).toBe(0);
    expect(totals(pending).Pending).toBe(2000);
    expect(illustrativeDataset.allVerifiedMinor).toBe(0);
  });
});
