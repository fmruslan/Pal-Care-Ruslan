import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  answerConversationTurn,
  type ConversationPlan,
} from "../../src/lib/careos/records/conversation-service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import type { GuardianView } from "../../src/lib/price-guardian/contracts";
import { emptySavedCare, type SavedCare } from "../../src/lib/care/store";
import { readinessPlan } from "../../src/lib/readiness-plan";
import { isolatedCareEnvironment } from "../helpers/isolated-care-environment";
import { careFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { careProductCards } from "../../src/lib/care/summary";
import {
  evidenceLabel,
  returnTimeline,
  warrantyDeadline,
} from "../../src/lib/care/contracts";
import {
  customerNavigation,
  customerSection,
} from "../../src/lib/customer-navigation";
import {
  libraryHref,
  libraryReturn,
  parseLibraryQuery,
} from "../../src/lib/library-navigation";

const now = new Date("2026-11-04T12:00:00Z");
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function feed(change: Partial<Parameters<typeof careFeed>[0]> = {}) {
  return careFeed({
    data: structuredClone(demoData),
    knowledge: [referenceSource],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now,
    ...change,
  });
}

describe("Care read-only domain", () => {
  it("ordinary test servers cannot inherit application Care reads/writes after activation", () => {
    const env = Object.assign(
      {},
      {
        CARE_RECORDS_ENABLED: "true",
        CARE_READER_DATABASE_URL: "must-not-use-application",
        CARE_WATCH_DATABASE_URL: "must-not-use-worker",
      },
      isolatedCareEnvironment,
    );
    expect(env.CARE_RECORDS_ENABLED).toBe("false");
    expect(env.CARE_READER_DATABASE_URL).toBe("");
    expect(env.CARE_WATCH_DATABASE_URL).toBe("");
  });
  it("adds only a separate read-only readiness requirement and denies writer credentials in the web runtime", () => {
    const base = {
      APP_ORIGIN: "http://127.0.0.1:3100",
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader:test@localhost/app",
      CAREOS_DATABASE_URL: "postgresql://care:test@localhost/app",
      CAREOS_PROVIDER: "fixture",
      CARE_RECORDS_ENABLED: "true",
      CARE_READER_DATABASE_URL: "postgresql://care_reader:test@localhost/app",
    };
    expect(readinessPlan(base).requirements.at(-1)?.capability).toBe(
      "care_reader",
    );
    expect(() =>
      readinessPlan({ ...base, CARE_READER_DATABASE_URL: undefined }),
    ).toThrow();
    expect(() =>
      readinessPlan({
        ...base,
        CARE_REPORTER_DATABASE_URL: "postgresql://writer:test@localhost/app",
      }),
    ).toThrow();
    expect(() =>
      readinessPlan({
        ...base,
        CARE_WATCH_DATABASE_URL: "postgresql://worker:test@localhost/app",
      }),
    ).toThrow();
  });
  it("keeps four destinations with dated Twins under Purchases and distinct Documents", () => {
    expect(customerNavigation.map((n) => n.label)).toEqual([
      "Care",
      "Purchases",
      "Insights",
      "Documents",
    ]);
    expect(customerSection("/vault/" + id(201))?.label).toBe("Purchases");
    expect(libraryHref(parseLibraryQuery({ q: "kettle receipt" }))).toBe(
      "/purchases?q=kettle+receipt",
    );
    expect(libraryReturn("/dashboard?category=Audio")).toBe(
      "/purchases?category=Audio",
    );
    expect(libraryReturn("https://evil.test/purchases")).toBe("/purchases");
  });
  it("does not turn historical purchase/catalog amounts into an actionable price drop or coverage", () => {
    const result = feed();
    expect(result.items.map((i) => i.kind)).toEqual(["care"]);
    expect(result.items[0].group).toBe("tracking");
    expect(careProductCards(result)).toHaveLength(result.purchases.length);
    expect(careProductCards(result, "attention")).toEqual([]);
    expect(
      result.protections.every(
        (p) =>
          p.state === "unavailable" && p.deadline === null && !p.monitoring,
      ),
    ).toBe(true);
    expect(
      result.items.some((item) => item.action.label === "Compare prices"),
    ).toBe(false);
    expect(result.items.some((i) => i.kind === "return")).toBe(false);
    expect(result.tracking.warranties).toContain("No verified");
  });
  it("uses exact-model sources and never borrows Pi guidance for headphones", () => {
    expect(
      feed()
        .items.filter((i) => i.kind === "care")
        .map((i) => i.purchase.id),
    ).toEqual([id(204)]);
    expect(
      feed({ knowledge: [] }).items.filter((i) => i.kind === "care"),
    ).toEqual([]);
    expect(
      feed({ knowledge: [{ ...referenceSource, contentHash: "0".repeat(64) }] })
        .unavailable,
    ).toContain("Product care evidence");
  });
  it("does not claim withdrawn or conflicting guidance is available", () => {
    expect(
      feed({
        knowledge: [{ ...referenceSource, status: "withdrawn" }],
      }).items.some((i) => i.kind === "care"),
    ).toBe(false);
    expect(
      feed({
        knowledge: [{ ...referenceSource, status: "conflicting" }],
      }).items.some((i) => i.kind === "care"),
    ).toBe(false);
  });
  it("excludes unknown products, changed identity, currency and invalid catalog prices", () => {
    for (const update of [
      { model: "wrong" },
      { currency: "EUR" },
      { priceMinor: -1 },
      { priceMinor: 1.5 },
    ]) {
      const data = structuredClone(demoData);
      Object.assign(data.products[0], update);
      // Sample product identity follows its catalog; currency/price still fail closed.
      if ("model" in update) {
        data.products[0].priceMinor = 14900;
      }
      expect(feed({ data }).items.some((i) => i.kind === "price")).toBe(false);
    }
  });
  it("keeps data failures explicit and no completed placeholders", () => {
    const result = feed({
      guardian: null,
      knowledge: [],
      unavailable: ["Product care"],
    });
    expect(result.unavailable).toContain("Price Guardian");
    expect(result.unavailable).toContain("Product care");
    expect(result.items.filter((i) => i.group === "completed")).toEqual([]);
    expect(
      feed({
        data: { ...demoData, customer: { ...demoData.customer, kind: "real" } },
      }).purchases,
    ).toEqual([]);
  });
  it("uses the complete bounded purchase read instead of the 12-card library page", () => {
    const data = structuredClone(demoData);
    for (let i = 0; i < 18; i++)
      data.twins.push({ ...demoData.twins[0], id: id(800 + i) });
    expect(feed({ data }).purchases).toHaveLength(22);
    expect(careProductCards(feed({ data }))).toHaveLength(22);
    expect(feed({ data }).items.filter((i) => i.kind === "price")).toHaveLength(
      0,
    );
  });
  it("North returns the same factual finding and original source links as Care", () => {
    const result = feed();
    const answer = careStatusAnswer(result, 3, [id(201)], "price");
    expect(answer.steps[0]).toContain(
      result.ownership
        .find((v) => v.twinId === id(201))!
        .facts.find((f) => f.topic === "price")!.detail,
    );
    expect(answer.context?.twinId).toBe(id(201));
    expect(answer.actions[0].href).toBe(`/vault/${id(201)}?milestone=price`);
    expect(answer.sources.every((s) => s.href.startsWith("/documents/"))).toBe(
      true,
    );
  });
  it.each(["returns", "refunds", "warranty"])(
    "North preserves unsupported %s evidence honestly",
    (topic) => {
      const answer = careStatusAnswer(feed(), 0, [id(201)], topic);
      expect(answer.outcome).toBe("missing");
      expect(answer.text).toContain(
        "No confirmed outcome or deadline is saved in the available records",
      );
      expect(answer.steps.join(" ")).toMatch(
        /No (?:confirmed|supported|verified)|not refund evidence/,
      );
      expect(answer.actions[0].href).toBe(
        `/vault/${id(201)}?milestone=${topic}`,
      );
    },
  );
  it("North cannot turn incomplete evidence into an all-clear", () => {
    const answer = careStatusAnswer(
      feed({ guardian: null }),
      0,
      [id(202)],
      "refunds",
    );
    expect(answer.outcome).toBe("unavailable");
    expect(answer.text).toContain("a missing result is not confirmation");
  });
  it("only independently verified refund evidence moves a case to Completed; pending/unknown keep their reservations", () => {
    const data = structuredClone(demoData);
    data.twins.push({
      ...data.twins[0],
      id: id(205),
      origin: "sandbox",
      purchasedOn: "2026-10-22",
      purchasePriceMinor: 12900,
      checkoutOrderId: id(901),
      paypalOrderId: "ORDER123456789",
      paypalCaptureId: "CAPTURE123456789",
      verifiedAt: "2026-10-22T10:00:00Z",
      productSnapshot: {
        ...data.products[0],
        currency: "USD",
        merchantName: data.merchant.name,
      },
      createdAt: "2026-10-22T10:00:00Z",
    });
    const record: GuardianView = {
      id: id(601),
      twinId: id(205),
      productName: "untrusted label",
      state: "completed",
      revision: 1,
      originalMinor: 12900,
      comparedMinor: 10900,
      amountMinor: 2000,
      policyVersion: "demo-price-v2",
      policyHash: "a".repeat(64),
      policyTerms: "Synthetic test policy",
      priceOrigin: "controlled_demo",
      priceObservedAt: "2026-10-23T10:00:00Z",
      expiresAt: "2026-11-05T10:00:00Z",
      reason: "eligible",
      refundId: "REFUND123456789",
      providerStatus: "COMPLETED",
      verifiedAt: "2026-10-23T11:00:00Z",
      createdAt: "2026-10-23T10:00:00Z",
      updatedAt: "2026-10-23T11:00:00Z",
      approvedAt: null,
      approvalExpiresAt: null,
      attemptedAt: "2026-10-23T10:30:00Z",
      checkedAt: "2026-10-23T11:00:00Z",
      history: [],
    };
    for (const [change, group] of [
      [{}, "completed"],
      [{ verifiedAt: null }, "action"],
      [
        { state: "pending", providerStatus: "PENDING", verifiedAt: null },
        "tracking",
      ],
      [{ state: "unknown", providerStatus: null, verifiedAt: null }, "action"],
    ] as const) {
      const result = feed({
        data,
        guardian: { ...emptyOverview(), cases: [{ ...record, ...change }] },
      });
      const item = result.items.find((i) => i.kind === "refund")!;
      expect(item.group).toBe(group);
      expect(item.verified).toBe(group === "completed");
      if (group === "completed")
        expect(item.status).toBe("Partially refunded in Sandbox");
    }
    expect(
      feed({
        data,
        guardian: {
          ...emptyOverview(),
          cases: [{ ...record, twinId: id(201) }],
        },
      }).items.some((i) => i.kind === "refund"),
    ).toBe(false);
  });
});

describe("future Care evidence contracts (not activated persistence)", () => {
  const evidence = {
    kind: "manual" as const,
    reference: "my-note",
    recordedAt: "2026-11-04T12:00:00Z",
    effectiveOn: "2026-11-03",
    href: `/vault/${id(201)}`,
  };
  it("keeps manual reports distinct", () => {
    expect(evidenceLabel(evidence)).toBe("Reported by you");
    expect(evidenceLabel({ ...evidence, kind: "sample" })).toBe(
      "Fictional demonstration",
    );
  });
  it("does not infer missing return milestones or a refund from return arrival", () => {
    const record = {
      id: id(910),
      caseId: id(911),
      twinId: id(201),
      state: "received",
      evidence,
    };
    const result = returnTimeline(id(201), [
      record,
      record,
      { ...record, twinId: id(202) },
    ]);
    expect(result.map((r) => r.state)).toEqual(["received"]);
    expect(
      returnTimeline(id(201), [record, { ...record, state: "closed" }]),
    ).toEqual([]);
  });
  it("rejects unsafe or malformed evidence", () => {
    expect(
      returnTimeline(id(201), [
        {
          id: id(910),
          caseId: id(911),
          twinId: id(201),
          state: "received",
          evidence: { ...evidence, href: "https://evil.test" },
        },
      ]),
    ).toEqual([]);
    expect(
      warrantyDeadline(
        { twinId: id(201), evidence, expiresOn: "2026-02-30", basis: "manual" },
        "2026-11-04",
      ),
    ).toBeNull();
  });
  it("never manufactures a warranty date, and preserves the exact stated basis", () => {
    expect(
      warrantyDeadline({ twinId: id(201), evidence }, "2026-11-04"),
    ).toBeNull();
    const result = warrantyDeadline(
      {
        twinId: id(201),
        evidence,
        expiresOn: "2026-12-04",
        basis: "Date manually reported; coverage not verified",
      },
      "2026-11-04",
    )!;
    expect(result.days).toBe(30);
    expect(result.approaching).toBe(true);
    expect(result.evidence.kind).toBe("manual");
    expect(result.basis).toContain("not verified");
    expect(
      warrantyDeadline({ ...result, days: undefined }, "bad-date"),
    ).toBeNull();
  });
});

describe("durable Care projection (isolated data; activation remains off)", () => {
  it("does not turn a partial persisted-care read into an all-clear", () => {
    const result = feed({
      savedCare: { ...emptySavedCare(), complete: false },
      persistenceEnabled: true,
    });
    expect(result.complete).toBe(false);
    expect(careStatusAnswer(result, 0, [id(201)], "returns").outcome).toBe(
      "unavailable",
    );
  });
  const evidence = {
    kind: "manual" as const,
    reference: "Owner-reported note",
    recordedAt: "2026-11-04T10:00:00Z",
    effectiveOn: "2026-11-03",
    href: `/vault/${id(201)}`,
  };
  it("shows manual return progress without inferring a refund, then distinguishes manual closure from verification", () => {
    const saved = emptySavedCare();
    saved.returns.push({
      id: id(911),
      twinId: id(201),
      caseId: id(910),
      state: "received",
      evidence,
    });
    let result = feed({ savedCare: saved, persistenceEnabled: true });
    expect(result.items.find((i) => i.kind === "return")?.group).toBe(
      "tracking",
    );
    expect(result.items.find((i) => i.kind === "return")?.verified).toBe(false);
    expect(
      careStatusAnswer(result, 0, [id(201)], "returns").steps.join(" "),
    ).toContain("No refund is inferred");
    saved.returns.push({
      id: id(912),
      twinId: id(201),
      caseId: id(910),
      state: "closed",
      evidence: {
        ...evidence,
        effectiveOn: "2026-11-04",
        recordedAt: "2026-11-04T11:00:00Z",
      },
    });
    result = feed({ savedCare: saved, persistenceEnabled: true });
    expect(result.items.find((i) => i.kind === "return")?.group).toBe(
      "completed",
    );
    expect(result.items.find((i) => i.kind === "return")?.verified).toBe(false);
  });
  it("keeps a non-urgent manual warranty date out of the feed but available to North", () => {
    const saved = emptySavedCare();
    saved.warranties.push({
      twinId: id(201),
      evidence,
      expiresOn: "2027-05-01",
      basis: "Manual date; not real coverage",
    });
    const result = feed({ savedCare: saved, persistenceEnabled: true });
    expect(result.items.some((i) => i.kind === "warranty")).toBe(false);
    expect(
      careStatusAnswer(result, 0, [id(201)], "warranty").steps.join(" "),
    ).toContain("2027-05-01");
    expect(
      careStatusAnswer(result, 0, [id(201)], "warranty").steps.join(" "),
    ).toContain("Reported by you");
  });
  it("requires configured schedule plus a fresh successful check; paused and expired watches are not active", () => {
    const watch: SavedCare["watches"][number] = {
      id: id(920),
      twinId: id(201),
      state: "active",
      lastCheckedAt: "2026-11-04T10:00:00Z",
      nextCheckAt: "2026-11-05T10:00:00Z",
      observedMinor: 12900,
      expiresAt: "2026-11-10T10:00:00Z",
    };
    const project = (change: Partial<typeof watch> = {}, scheduled = true) =>
      feed({
        savedCare: { ...emptySavedCare(), watches: [{ ...watch, ...change }] },
        persistenceEnabled: true,
        scheduled,
      }).items.filter((i) => i.kind === "watch");
    expect(project()[0].group).toBe("tracking");
    expect(project({}, false)[0].status).toContain("monitoring not confirmed");
    expect(project({ nextCheckAt: "2026-11-03T10:00:00Z" })[0].group).toBe(
      "tracking",
    );
    expect(project({ state: "paused" })).toEqual([]);
    expect(project({ expiresAt: "2026-11-01T10:00:00Z" })).toEqual([]);
    const observed = feed({
      savedCare: {
        ...emptySavedCare(),
        watches: [{ ...watch, observedMinor: 10900 }],
      },
      persistenceEnabled: true,
      scheduled: true,
    }).items.find((i) => i.kind === "watch")!;
    expect(observed.detail).toContain("$109.00");
    expect(observed.detail).toContain(
      "not a verified price-change event or adjustment eligibility",
    );
    expect(observed.at).toBe(watch.lastCheckedAt);
  });
});

describe("North model-planned Care tool", () => {
  function setup(change: Partial<ConversationPlan> = {}) {
    const { version, referenceDate, timezone, ...query } =
      emptyRecordsQuery("2026-11-04");
    void version;
    void referenceDate;
    void timezone;
    const plan: ConversationPlan = {
      task: "aftercare",
      relation: "fresh",
      query: { ...query, outcome: "query" },
      comparison: null,
      productSearch: "",
      productAction: "attention",
      careQuestion: "",
      clarification: "",
      ...change,
    };
    const interpret = vi.fn(async (payload: string) => {
      void payload;
      return plan;
    });
    const saved = emptySavedCare();
    for (const twinId of [id(201), id(204)])
      saved.returns.push({
        id: id(1900 + Number(twinId.slice(-3))),
        caseId: id(900 + Number(twinId.slice(-3))),
        twinId,
        state: "prepared",
        evidence: {
          kind: "manual",
          reference: "test-unsent-enquiry",
          effectiveOn: "2026-11-03",
          recordedAt: "2026-11-04T10:00:00Z",
          href: `/vault/${twinId}`,
        },
      });
    const care = vi.fn(async () => feed({ savedCare: saved }));
    const options = {
      input: {
        requestId: randomUUID(),
        twinId: null,
        revision: 0,
        message: "Anything worth checking on my stuff?",
      },
      history: [],
      load: async () => structuredClone(demoData),
      interpret,
      care,
      knowledge: async () => [referenceSource],
      model: { classify: vi.fn(), explain: vi.fn() },
      call: vi.fn(),
      now: () => now,
    };
    return { options, interpret, care };
  }
  it("lets the model select the Care task while the server supplies every fact", async () => {
    const { options, interpret, care } = setup();
    const answer = await answerConversationTurn(options);
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(JSON.parse(interpret.mock.calls[0][0]).question).toBe(
      options.input.message,
    );
    expect(care).toHaveBeenCalledTimes(1);
    expect(
      answer.steps.some((s) =>
        s.includes("Return message prepared · not sent"),
      ),
    ).toBe(true);
    expect(answer.mode).toBe("live"); // Injected interpretation, not provider proof.
    expect(options.model.explain).not.toHaveBeenCalled();
  });
  it("keeps a return enquiry bound to the exact selected purchase", async () => {
    const { options } = setup({
      relation: "selected",
      productAction: "returns",
    });
    const answer = await answerConversationTurn({
      ...options,
      input: { ...options.input, twinId: id(202) },
    });
    expect(answer.context?.twinId).toBe(id(202));
    expect(answer.text).toContain(
      "draft an enquiry for you to review and send",
    );
    expect(answer.actions[0].href).toBe(`/vault/${id(202)}?milestone=returns`);
  });
  it("does not narrow a fresh broad Care question to an old selected purchase", async () => {
    const { options } = setup();
    const answer = await answerConversationTurn({
      ...options,
      input: { ...options.input, twinId: id(202) },
    });
    expect(answer.careSelection).toEqual([id(201), id(204)]);
    expect(answer.context).toBeNull();
  });
  it("rejects unowned follow-up anchors before any data, model or Care tool work", async () => {
    const { options, interpret, care } = setup();
    const load = vi.fn(options.load);
    await expect(
      answerConversationTurn({
        ...options,
        load,
        input: { ...options.input, followupRequestId: randomUUID() },
      }),
    ).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
    expect(interpret).not.toHaveBeenCalled();
    expect(care).not.toHaveBeenCalled();
  });
  it("keeps a Care finding selection for ordinary records follow-ups without browser-trusted history", async () => {
    const { options } = setup({
      productAction: "returns",
      relation: "selected",
    });
    const first = await answerConversationTurn({
      ...options,
      input: { ...options.input, twinId: id(201) },
    });
    expect(first.careSelection).toEqual([id(201)]);
    const next = setup({ task: "records", relation: "followup" });
    const answer = await answerConversationTurn({
      ...next.options,
      history: [
        {
          requestId: options.input.requestId,
          message: options.input.message,
          answer: first,
        },
      ],
    });
    expect(answer.recordsResult?.records.map((p) => p.id)).toEqual([id(201)]);
  });
});
