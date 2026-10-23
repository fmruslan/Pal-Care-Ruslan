import { describe, it, expect } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { projectActivity } from "../../src/lib/careos/activity";
import type { GuardianView } from "../../src/lib/price-guardian/contracts";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { buildBriefing } from "../../src/lib/careos/briefing";
describe("unified read-only purchase activity", () => {
  const pending = {
    id: crypto.randomUUID(),
    twinId: demoData.twins[0].id,
    revision: 1,
    state: "pending",
    amountMinor: 2000,
    updatedAt: "2026-10-23T01:00:00Z",
    policyVersion: "test-v2",
    priceOrigin: "controlled_demo",
    refundId: null,
    providerStatus: "PENDING",
    verifiedAt: null,
    history: [
      {
        id: crypto.randomUUID(),
        kind: "refund.pending",
        at: "2026-10-23T01:00:00Z",
        detail: "Provider pending, not completed.",
      },
    ],
  } as GuardianView;
  const recall = {
    id: crypto.randomUUID(),
    twinId: pending.twinId,
    state: "possible_match",
    reason: "Check physical identifiers",
    at: "2026-10-23T02:00:00Z",
    hash: "a".repeat(64),
  };
  it("combines purchase, receipt, adjustment and recall without promoting uncertainty or duplicates", () => {
    const view = projectActivity(
      demoData,
      [pending],
      [recall, recall],
      ["Recall Guardian"],
    );
    expect(view.items.some((i) => i.kind === "care")).toBe(true);
    expect(view.items.some((i) => i.kind === "document")).toBe(true);
    expect(
      view.items.filter((i) => i.kind === "refund").every((i) => !i.verified),
    ).toBe(true);
    expect(view.items.filter((i) => i.kind === "recall")).toHaveLength(1);
    expect(view.items.find((i) => i.kind === "recall")?.detail).toContain(
      "physical identity is not certified",
    );
    expect(view.unavailable).toEqual(["Recall Guardian"]);
    expect(new Set(view.items.map((i) => i.id)).size).toBe(view.items.length);
  });
  it("requires independent refund evidence and excludes foreign Twin events", () => {
    expect(
      projectActivity(demoData, [
        { ...pending, state: "completed" },
      ]).items.find((i) => i.id.startsWith("guardian-state:"))?.verified,
    ).toBe(false);
    const completed = {
      ...pending,
      state: "completed" as const,
      providerStatus: "COMPLETED",
      refundId: "PROOF",
      verifiedAt: "2026-10-23T01:00:00Z",
    };
    expect(
      projectActivity(demoData, [completed]).items.find((i) =>
        i.id.startsWith("guardian-state:"),
      )?.verified,
    ).toBe(true);
    expect(
      projectActivity(demoData, [
        { ...completed, twinId: crypto.randomUUID() },
      ]).items.some((i) => i.kind === "refund"),
    ).toBe(false);
  });
  it("CareOS history and Glance use the same uncertain recall/refund evidence with partial-source disclosure", () => {
    const activity = projectActivity(
      demoData,
      [pending],
      [recall],
      ["Price Guardian"],
    );
    const input = {
      requestId: crypto.randomUUID(),
      twinId: pending.twinId,
      revision: 1,
      message: "Show history",
      intent: "history" as const,
    };
    const answer = deterministicAnswer(
      demoData,
      input,
      "history",
      [],
      undefined,
      activity,
    );
    expect(answer.text).toContain("Partial history");
    expect(answer.steps.join(" ")).toContain("possible match");
    const briefing = buildBriefing(demoData, [], [pending], activity);
    expect(briefing[0].action.href).toBe(`/safety?twinId=${pending.twinId}`);
    expect(briefing[0].detail).toContain("physical identity is not certified");
  });
});
