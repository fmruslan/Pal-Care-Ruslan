import { describe, expect, it, vi } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import { careFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptySavedCare } from "../../src/lib/care/store";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import {
  guardianPolicyHash,
  guardianTerms,
} from "../../src/lib/price-guardian/policy";
import type { GuardianView } from "../../src/lib/price-guardian/contracts";
import { ownershipHref, ownershipTopic } from "../../src/lib/care/ownership";
import {
  ownershipPostcondition,
  careHomepagePostcondition,
  ownershipPresentationTarget,
} from "../../src/lib/care/ownership-presentation";
import {
  answerConversationTurn,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import {
  careMilestones,
  careProductCards,
  careNextWindow,
  careMilestoneState,
} from "../../src/lib/care/summary";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-11-04T12:00:00Z");
const input = () => ({
  requestId: id(990),
  twinId: id(201),
  revision: 1,
  message: "Show the delivery milestone for this purchase",
});
function project(change: Partial<Parameters<typeof careFeed>[0]> = {}) {
  return careFeed({
    data: structuredClone(demoData),
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now,
    ...change,
  });
}
const evidence = {
  kind: "manual" as const,
  reference: "reported-note",
  recordedAt: "2026-11-04T10:00:00Z",
  effectiveOn: "2026-11-03",
  href: `/vault/${id(201)}`,
};

describe("one ownership view across Twin, Care and North", () => {
  it("summarizes the original shared facts, retains unknowns and selects only recorded upcoming windows", () => {
    const feed = project();
    const view = feed.ownership.find((v) => v.twinId === id(201))!;
    const summary = careMilestones(view, "price");
    for (const topic of [
      "purchase",
      "delivery",
      "price-window",
      "return-window",
      "warranty",
      "price",
    ]) {
      expect(summary.find((f) => f.topic === topic)).toBe(
        view.facts.find((f) => f.topic === topic),
      );
    }
    expect(careNextWindow(view)).toBeNull();
    expect(
      careMilestoneState(view.facts.find((f) => f.topic === "purchase")!),
    ).toBe("Recorded");
    const saved = emptySavedCare();
    saved.warranties.push({
      twinId: id(201),
      expiresOn: "2026-11-14",
      basis: "Reported only",
      evidence,
    });
    const dated = project({ savedCare: saved }).ownership.find(
      (v) => v.twinId === id(201),
    )!;
    expect(careNextWindow(dated)).toBe(
      dated.facts.find((f) => f.topic === "warranty"),
    );
    expect(
      careNextWindow({
        ...dated,
        facts: dated.facts.map((f) => ({ ...f, state: "expired" as const })),
      }),
    ).toBeNull();
  });
  it("groups every finding once per product without losing watch/source evidence", () => {
    const feed = project();
    const first = feed.items[0];
    feed.items.push({
      ...first,
      id: "secondary-watch",
      kind: "watch",
      group: "tracking",
    });
    const cards = careProductCards(feed, false);
    expect(
      cards.filter((c) => c.item.purchase.id === first.purchase.id),
    ).toHaveLength(1);
    expect(
      cards
        .find((c) => c.item.purchase.id === first.purchase.id)!
        .findings.map((f) => f.id),
    ).toContain("secondary-watch");
    expect(cards.flatMap((c) => c.findings)).toHaveLength(
      feed.items.filter((i) => i.group !== "completed").length,
    );
    expect(careProductCards(feed, true)).toHaveLength(0);
  });
  it("resolves North homepage highlights from real cards and requires exact visible fact read-back", () => {
    const feed = project();
    const answer = careStatusAnswer(feed, 1, [id(201)], "delivery");
    const target = answer.careHighlights![0];
    expect(target).toEqual({
      twinId: id(201),
      topic: "delivery",
      revision: feed.ownership.find((v) => v.twinId === id(201))!.revision,
    });
    const actual = {
      pathname: "/dashboard",
      twinId: target.twinId,
      topic: target.topic,
      revision: target.revision,
      visible: true,
      facts: 1,
    };
    expect(careHomepagePostcondition(target, actual)).toBe(true);
    for (const change of [
      { pathname: `/vault/${target.twinId}` },
      { twinId: id(202) },
      { topic: "warranty" },
      { revision: "bad" },
      { visible: false },
      { facts: 0 },
    ])
      expect(careHomepagePostcondition(target, { ...actual, ...change })).toBe(
        false,
      );
    expect(
      careStatusAnswer(feed, 1, [id(202)], "delivery").careHighlights,
    ).toBeUndefined();
  });
  it.each([
    "2026-11-05T09:59:59.999Z",
    "2026-11-05T10:00:00.000Z",
    "2026-11-05T10:00:00.001Z",
  ])(
    "keeps the bound price-policy deadline exclusive at %s, never retroactive",
    (clock) => {
      const data = structuredClone(demoData);
      data.twins.push({
        ...data.twins[0],
        id: id(205),
        origin: "sandbox",
        purchasePriceMinor: 12900,
        purchasedOn: "2026-10-22",
        checkoutOrderId: id(901),
        paypalOrderId: "ORDER123456789",
        paypalCaptureId: "CAPTURE123456789",
        verifiedAt: "2026-10-22T10:00:00Z",
        createdAt: "2026-10-22T10:00:00Z",
        productSnapshot: {
          ...data.products[0],
          priceMinor: 12900,
          currency: "USD",
          merchantName: data.merchant.name,
        },
      });
      const record: GuardianView = {
        id: id(601),
        twinId: id(205),
        productName: "untrusted",
        state: "awaiting_approval",
        revision: 1,
        originalMinor: 12900,
        comparedMinor: 10900,
        amountMinor: 2000,
        policyVersion: "demo-price-v2",
        policyHash: guardianPolicyHash,
        policyTerms: guardianTerms,
        priceOrigin: "controlled_demo",
        priceObservedAt: "2026-10-23T10:00:00Z",
        expiresAt: "2026-11-05T10:00:00.000Z",
        reason: "eligible",
        refundId: null,
        providerStatus: null,
        verifiedAt: null,
        createdAt: "2026-10-23T10:00:00Z",
        updatedAt: "2026-10-23T10:00:00Z",
        approvedAt: null,
        approvalExpiresAt: null,
        attemptedAt: null,
        checkedAt: null,
        history: [],
      };
      const feed = project({
        data,
        guardian: { ...emptyOverview(), cases: [record] },
        now: new Date(clock),
      });
      const fact = feed.ownership
        .find((v) => v.twinId === id(205))!
        .facts.find((f) => f.topic === "price-window")!;
      expect(fact.date).toBe(record.expiresAt);
      expect(fact.state).toBe(
        clock < record.expiresAt ? "upcoming" : "expired",
      );
      expect(fact.detail).toContain("exclusive");
      expect(
        feed.ownership
          .find((v) => v.twinId === id(201))!
          .facts.find((f) => f.topic === "price-window")!.date,
      ).toBeNull();
    },
  );
  it("starts with real purchase provenance and explicit evidence gaps, not fabricated delivery or deadlines", () => {
    const view = project().ownership.find((v) => v.twinId === id(201))!;
    expect(view.pill).toMatchObject({ label: "Purchased", verified: false });
    expect(view.facts.find((f) => f.topic === "purchase")).toMatchObject({
      date: "2026-10-18",
      provenance: "Sample purchase record",
      verified: false,
    });
    for (const topic of [
      "shipment",
      "delivery",
      "price-window",
      "return-window",
      "warranty",
    ]) {
      expect(view.facts.find((f) => f.topic === topic)?.date).toBeNull();
      expect(view.facts.find((f) => f.topic === topic)?.verified).toBe(false);
    }
    expect(view.facts.find((f) => f.topic === "delivery")?.detail).toContain(
      "not delivery evidence",
    );
    expect(
      view.facts.find((f) => f.topic === "price-window")?.detail,
    ).toContain("not retroactive");
    expect(view.facts.find((f) => f.topic === "safety")?.detail).toContain(
      "not a safety all-clear",
    );
  });
  it("does not turn historical sample return reminders into a current case or countdown", () => {
    const view = project().ownership.find((v) => v.twinId === id(201))!;
    expect(
      view.history.some((f) => f.provenance.includes("Fictional sample event")),
    ).toBe(true);
    expect(view.facts.find((f) => f.topic === "returns")?.state).toBe(
      "unknown",
    );
    expect(
      view.facts.find((f) => f.topic === "return-window")?.date,
    ).toBeNull();
  });
  it("uses the same complete price finding on the timeline, Care and North, without calling it savings", () => {
    const feed = project();
    const item = feed.items.find((f) => f.kind === "price")!;
    const fact = feed.ownership
      .find((v) => v.twinId === id(201))!
      .facts.find((f) => f.id === item.id)!;
    const answer = careStatusAnswer(feed, 1, [id(201)], "price");
    expect(fact.status).toBe(item.status);
    expect(fact.detail).toBe(item.detail);
    expect(answer.steps.join(" ")).toContain(fact.detail);
    expect(item.action.href).toBe(ownershipHref(id(201), "price"));
    expect(answer.actions[0].href).toBe(item.action.href);
    expect(fact.date).toBeNull(); // No invented time when the price changed.
  });
  it("records a manual return milestone without filling missing steps or manufacturing a refund", () => {
    const saved = emptySavedCare();
    saved.returns.push({
      id: id(920),
      caseId: id(921),
      twinId: id(201),
      state: "received",
      evidence,
    });
    const feed = project({ savedCare: saved });
    const view = feed.ownership.find((v) => v.twinId === id(201))!;
    expect(
      view.history.filter((f) => f.topic === "returns").map((f) => f.status),
    ).toEqual(["Return received · reported by you"]);
    expect(view.pill.verified).toBe(false);
    expect(view.facts.find((f) => f.topic === "refunds")?.verified).toBe(false);
    expect(
      careStatusAnswer(feed, 1, [id(201)], "returns").steps.join(" "),
    ).toContain("No refund is inferred");
  });
  it("keeps rejected/cancelled returns in inspectable history even though they are not attention cards", () => {
    const saved = emptySavedCare();
    saved.returns.push({
      id: id(920),
      caseId: id(921),
      twinId: id(201),
      state: "cancelled",
      evidence,
    });
    const view = project({ savedCare: saved }).ownership.find(
      (v) => v.twinId === id(201),
    )!;
    expect(view.history.some((f) => f.status.includes("cancelled"))).toBe(true);
    expect(view.pill.label).toBe("Purchased");
  });
  it.each(["2026-11-03", "2026-11-04", "2026-12-04", "2028-02-29"])(
    "preserves an exact manually sourced warranty date %s and its UTC basis",
    (expiresOn) => {
      const saved = emptySavedCare();
      saved.warranties.push({
        twinId: id(201),
        expiresOn,
        basis: "Owner-reported date, not coverage",
        evidence,
      });
      const feed = project({ savedCare: saved });
      const fact = feed.ownership
        .find((v) => v.twinId === id(201))!
        .facts.find((f) => f.topic === "warranty")!;
      expect(fact.date).toBe(expiresOn);
      expect(fact.verified).toBe(false);
      expect(fact.detail).toContain("Calendar-day calculation uses UTC");
      expect(
        careStatusAnswer(feed, 0, [id(201)], "warranty").steps.join(" "),
      ).toContain(fact.detail);
      if (expiresOn < "2026-11-04") expect(fact.state).toBe("expired");
      if (expiresOn === "2026-11-04") expect(fact.status).toContain("today");
    },
  );
  it("retains nonurgent dates even when Care has no corresponding attention card", () => {
    const saved = emptySavedCare();
    saved.warranties.push({
      twinId: id(201),
      expiresOn: "2027-05-01",
      basis: "Reported only",
      evidence,
    });
    const feed = project({ savedCare: saved });
    expect(feed.items.some((i) => i.kind === "warranty")).toBe(false);
    expect(
      feed.ownership
        .find((v) => v.twinId === id(201))!
        .facts.find((f) => f.topic === "warranty")?.date,
    ).toBe("2027-05-01");
  });
  it("does not choose arbitrarily between conflicting warranty dates", () => {
    const saved = emptySavedCare();
    saved.warranties.push(
      ...["2026-11-05", "2027-05-01"].map((expiresOn) => ({
        twinId: id(201),
        expiresOn,
        basis: "Reported",
        evidence,
      })),
    );
    const view = project({ savedCare: saved }).ownership.find(
      (v) => v.twinId === id(201),
    )!;
    expect(view.facts.find((f) => f.topic === "warranty")).toMatchObject({
      state: "attention",
      date: null,
      status: "Conflicting recorded dates",
    });
    expect(view.pill.label).toBe("Needs attention");
  });
  it("preserves unavailable and incomplete facts without silently converting them into an all-clear", () => {
    const feed = project({
      guardian: null,
      savedCare: { ...emptySavedCare(), complete: false },
      unavailable: ["Care tracking"],
    });
    const view = feed.ownership[0];
    expect(view.complete).toBe(false);
    expect(view.facts.find((f) => f.topic === "warranty")?.state).toBe(
      "unavailable",
    );
    expect(careStatusAnswer(feed, 1, [view.twinId], "refunds").outcome).toBe(
      "unavailable",
    );
    expect(view.facts.find((f) => f.topic === "purchase")?.state).toBe(
      "recorded",
    );
  });
  it("keeps paused and expired watch evidence visible without claiming active monitoring", () => {
    const saved = emptySavedCare();
    saved.watches.push({
      id: id(920),
      twinId: id(201),
      state: "paused",
      observedMinor: 12900,
      lastCheckedAt: "2026-11-03T10:00:00Z",
      nextCheckAt: "2026-11-04T10:00:00Z",
      expiresAt: "2026-11-05T10:00:00Z",
    });
    const view = project({ savedCare: saved, scheduled: true }).ownership.find(
      (v) => v.twinId === id(201),
    )!;
    expect(view.facts.find((f) => f.topic === "watch")?.detail).toContain(
      "not proof of active monitoring",
    );
    expect(view.facts.find((f) => f.topic === "watch")?.status).toContain(
      "paused",
    );
    saved.watches[0].expiresAt = "2026-11-03T10:00:00Z";
    expect(
      project({ savedCare: saved })
        .ownership.find((v) => v.twinId === id(201))!
        .facts.find((f) => f.topic === "watch")?.state,
    ).toBe("expired");
  });
  it("stable source content has a stable revision across harmless read-time refreshes", () => {
    const first = project().ownership.find((v) => v.twinId === id(201))!;
    const later = project({
      now: new Date("2026-11-04T12:01:00Z"),
    }).ownership.find((v) => v.twinId === id(201))!;
    expect(first.asOf).not.toBe(later.asOf);
    expect(first.revision).toBe(later.revision);
  });
  it("invalid Twin/provenance cannot leak into ownership or a presentation target", () => {
    expect(
      project({
        data: { ...demoData, customer: { ...demoData.customer, kind: "real" } },
      }).ownership,
    ).toEqual([]);
    expect(() => ownershipHref("../../evil", "delivery")).toThrow();
    expect(() => ownershipHref(id(201), "https://evil.test")).toThrow();
    expect(ownershipTopic(["delivery"])).toBeNull();
  });
});

describe("North ownership presentation is real UI state, not model authority", () => {
  const expected = {
    twinId: id(201),
    topic: "delivery" as const,
    revision: "a1b2c3",
  };
  const actual = {
    pathname: `/vault/${id(201)}`,
    milestone: "delivery",
    twinId: id(201),
    topic: "delivery",
    revision: "a1b2c3",
    open: true,
    visible: true,
    facts: 1,
  };
  it("requires route, selected topic, visible open evidence and exact content revision", () => {
    expect(ownershipPresentationTarget(expected)).toBe(
      `/vault/${id(201)}?milestone=delivery`,
    );
    expect(ownershipPostcondition(expected, actual)).toBe(true);
    for (const change of [
      { pathname: "/dashboard" },
      { twinId: id(202) },
      { topic: "refunds" },
      { revision: "other" },
      { open: false },
      { visible: false },
      { facts: 0 },
    ])
      expect(ownershipPostcondition(expected, { ...actual, ...change })).toBe(
        false,
      );
  });
  it("uses the shared server fact and emits no successful-execution assertion before the UI runs", async () => {
    const {
      version: _v,
      referenceDate: _r,
      timezone: _t,
      ...query
    } = emptyRecordsQuery("2026-11-04");
    void _v;
    void _r;
    void _t;
    const plan: ConversationPlan = {
      task: "aftercare",
      relation: "selected",
      productSearch: "",
      productAction: "open_delivery",
      query: { ...query, outcome: "query" },
      comparison: null,
      clarification: "",
      careQuestion: "",
    };
    const care = vi.fn(async () => project());
    const answer = await answerConversationTurn({
      input: input(),
      history: [],
      load: async () => demoData,
      care,
      interpret: async () => plan,
      knowledge: async () => [],
      model: { classify: vi.fn(), explain: vi.fn() },
      call: vi.fn(),
      now: () => now,
    });
    expect(answer.context?.twinId).toBe(id(201));
    expect(answer.ownershipPresentation).toMatchObject({
      twinId: id(201),
      topic: "delivery",
    });
    expect(answer.text).not.toMatch(/opened|delivered|arrived/i);
    expect(answer.steps.join(" ")).toContain("Fictional goods do not ship");
    expect(care).toHaveBeenCalledTimes(1);
  });
});
