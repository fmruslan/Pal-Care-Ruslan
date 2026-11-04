import { describe, expect, it } from "vitest";
import {
  careMigrationBaseline,
  reviewedCareMigration,
} from "../../scripts/care-migration-plan";

describe("exact approved Care migration lane", () => {
  it("matches the approved DDL and preserves deferred 0016 as a separate pending migration", async () => {
    const plan = await reviewedCareMigration();
    expect(plan.baseline).toHaveLength(16);
    expect(careMigrationBaseline(plan.baseline, plan)).toBe("pending");
    const applied = [
      ...plan.baseline,
      { hash: plan.careHash, created_at: String(plan.order) },
    ];
    expect(careMigrationBaseline(applied, plan)).toBe("applied");
    expect(() =>
      careMigrationBaseline(
        [
          ...applied,
          { hash: "unapproved", created_at: String(plan.order + 1) },
        ],
        plan,
      ),
    ).toThrow();
    expect(() =>
      careMigrationBaseline([...plan.baseline.slice(1)], plan),
    ).toThrow();
  });
});
