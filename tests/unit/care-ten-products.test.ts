import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  answerConversationTurn,
  conversationPlanSchema,
} from "../../src/lib/careos/records/conversation-service";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  demoId,
  demoProducts,
  tenProductPack,
  withTenProductFixtures,
} from "../../src/lib/care/demo/catalog";
import {
  validateDemoPack,
  priceComparison,
  retailReferences,
} from "../../src/lib/care/demo/model";
import { careFeed } from "../../src/lib/care/model";
import { careProductCards } from "../../src/lib/care/summary";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { querySavedRecords } from "../../src/lib/careos/records/service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";

const now = new Date("2026-11-05T12:00:00Z");
const data = () => withTenProductFixtures(structuredClone(demoData));
const feedOf = (records = data(), evaluatedAt = now) =>
  careFeed({
    data: records,
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now: evaluatedAt,
  });

describe("ten-product evidence and price separation", () => {
  it.each([
    ["Clothing", 1],
    ["Home", 1],
    ["Books", 1],
    ["Games", 1],
    ["Computing", 2],
  ] as const)(
    "retains typed North category filtering for %s",
    (category, count) => {
      const query = {
        ...emptyRecordsQuery("2026-11-05"),
        categories: [category],
      };
      expect(querySavedRecords(data(), query).records).toHaveLength(count);
    },
  );
  it.each([
    [
      "What's coming up in my next 30 days?",
      "upcoming-care",
      "",
      "Return deadline",
    ],
    ["What needs my attention?", "attention", "", "Safety review"],
    [
      "What is my refrigerator's retail reference price?",
      "retail-reference",
      "Refrigerator",
      "$1,099.00",
    ],
    [
      "Which products have a lower recorded price?",
      "lower-reference",
      "",
      "Retail reference",
    ],
    [
      "Which return or warranty windows are closing?",
      "closing-windows",
      "",
      "demo days",
    ],
    [
      "Is my refrigerator still under warranty?",
      "warranty",
      "Refrigerator",
      "Warranty details",
    ],
    [
      "What's happening with my kettle delivery?",
      "delivery",
      "kettle",
      "There’s no live carrier connection",
    ],
    [
      "Can I get a price adjustment for my Raspberry Pi?",
      "price",
      "Raspberry Pi",
      "not savings",
    ],
    [
      "Are any of my products affected by a recall?",
      "safety",
      "",
      "No official recall match",
    ],
  ])(
    "executes the existing typed North planner path: %s (injected interpretation only)",
    async (message, productAction, productSearch, expected) => {
      const {
        version: _v,
        referenceDate: _d,
        timezone: _z,
        ...query
      } = emptyRecordsQuery("2026-11-05");
      void _v;
      void _d;
      void _z;
      const interpret = vi.fn(async () =>
        conversationPlanSchema.parse({
          task: "aftercare",
          relation: "fresh",
          query: { ...query, outcome: "query" },
          comparison: null,
          productSearch,
          productAction,
          careQuestion: "",
          clarification: "",
        }),
      );
      const model = { classify: vi.fn(), explain: vi.fn() };
      const answer = await answerConversationTurn({
        input: { message, requestId: randomUUID(), twinId: null, revision: 1 },
        history: [],
        load: async () => data(),
        interpret,
        knowledge: async () => [],
        care: async () => feedOf(),
        model,
        call: async () => {
          throw Error("Unexpected provider execution");
        },
        now: () => now,
      });
      expect(interpret).toHaveBeenCalledOnce();
      expect(answer.steps.join(" ")).toContain(expected);
      expect(model.explain).not.toHaveBeenCalled();
    },
  );
  it("adds only six distinct fictional purchases and preserves every original byte", () => {
    const saved = data();
    expect(saved.twins).toHaveLength(10);
    expect(saved.products).toHaveLength(10);
    expect(saved.twins.slice(0, 4)).toEqual(demoData.twins);
    expect(saved.documents.slice(0, 4)).toEqual(demoData.documents);
    expect(saved.events).toEqual(demoData.events);
    expect(new Set(demoProducts.map((p) => p.minor)).size).toBe(6);
    expect(
      saved.twins
        .slice(4)
        .every(
          (t) =>
            t.origin === "sample" &&
            t.paypalCaptureId === null &&
            t.verifiedAt === null,
        ),
    ).toBe(true);
  });
  it("has a dated individually sourced reference for every product", () => {
    const references = retailReferences(data(), now);
    expect(references).toHaveLength(10);
    expect(
      references.every(
        (r) =>
          r.checkedAt && r.variant && r.quote && r.seller && r.priceMinor > 0,
      ),
    ).toBe(true);
    expect(references.find((r) => r.productId === demoId(108))).toMatchObject({
      match: "comparable",
      priceMinor: 2199,
    });
  });
  it("never treats Pi placeholder or hypothetical amount as spending", () => {
    const saved = data();
    const result = querySavedRecords(saved, emptyRecordsQuery("2026-11-05"));
    const record = result.records.find((r) => r.id === demoId(204))!;
    expect(record.amountMinor).toBeNull();
    expect(
      saved.twins.find((t) => t.id === demoId(204))!.purchasePriceMinor,
    ).toBe(0);
    expect(priceComparison(null, tenProductPack.references[0])).toContain(
      "unavailable",
    );
    expect(
      result.records.reduce((sum, r) => sum + (r.amountMinor ?? 0), 0),
    ).toBe(
      14900 + 8900 + 6900 + demoProducts.reduce((sum, p) => sum + p.minor, 0),
    );
  });
  it("keeps comparable price differences explicitly non-eligible and non-live", () => {
    const r = tenProductPack.references.find(
      (r) => r.productId === demoId(101),
    )!;
    expect(priceComparison(14900, r)).toContain("comparable product");
    expect(priceComparison(14900, r)).toContain(
      "Not a historical price-drop event, eligibility or savings",
    );
  });
  it("does not return future-dated retail observations", () => {
    expect(retailReferences(data(), new Date("2026-11-04"))).toHaveLength(0);
  });
  it("rejects unsafe external links and duplicate source identities", () => {
    const pack = structuredClone(tenProductPack);
    pack.references[0].url = "https://www.pishop.us.evil.example/product";
    expect(() => validateDemoPack(pack)).toThrow();
    pack.references[0] = structuredClone(pack.references[1]);
    expect(() => validateDemoPack(pack)).toThrow("conflicting_demo_evidence");
  });
  it("rejects unordered/mismatched price observations", () => {
    const pack = structuredClone(tenProductPack);
    const s = pack.scenarios.find((s) => s.kind === "price")!;
    if (s.kind !== "price") throw Error();
    s.observations[1].variant = "Different capacity";
    expect(() => validateDemoPack(pack)).toThrow("invalid_demo_observations");
  });
  it("rejects attaching a scenario to the wrong product or document", () => {
    const saved = data();
    saved.demoCare!.scenarios[0].productId = demoId(101);
    expect(() => feedOf(saved)).toThrow("demo_purchase_binding_invalid");
  });
  it("projects ten useful scenarios, with zero verified protection invented", () => {
    const feed = feedOf();
    expect(careProductCards(feed)).toHaveLength(10);
    expect(feed.ownership.filter((v) => v.simulation)).toHaveLength(10);
    expect(feed.ownership.every((v) => !v.pill.verified)).toBe(true);
    expect(
      feed.protections.every((p) => !p.policyVerified && !p.monitoring),
    ).toBe(true);
    expect(careProductCards(feed, "attention")).toHaveLength(4);
    expect(careProductCards(feed, "protected")).toHaveLength(3);
    expect(careProductCards(feed, "watching")).toHaveLength(0);
    expect(careProductCards(feed, "completed")).toHaveLength(0);
  });
  it("retains both headphones identities under one card without borrowing sample coverage", () => {
    const saved = data();
    const prior = saved.twins[0];
    // Independent second sample identity is sufficient to test grouping; no fake Sandbox evidence.
    saved.twins.push({
      ...prior,
      id: demoId(290),
      purchasedOn: "2026-10-22",
      purchasePriceMinor: 12900,
    });
    const feed = feedOf(saved);
    const cards = careProductCards(feed);
    expect(cards).toHaveLength(10);
    expect(
      cards.find((c) => c.item.purchase.productId === demoId(101))!.members,
    ).toHaveLength(2);
    expect(
      feed.ownership.find((v) => v.twinId === demoId(290))!.simulation,
    ).toBeUndefined();
    expect(feed.purchases).toHaveLength(11);
  });
  it("retains expired warranty information without moving the original snapshot clock", () => {
    const saved = data();
    const later = new Date("2030-11-05T12:00:00Z");
    const feed = feedOf(saved, later);
    expect(careProductCards(feed, "protected")).toHaveLength(3);
    expect(
      careProductCards(feed, "protected").every((card) =>
        card.view!.facts.some(
          (fact) =>
            fact.topic === "warranty" &&
            fact.simulation &&
            fact.state === "expired" &&
            !fact.verified,
        ),
      ),
    ).toBe(true);
    expect(careProductCards(feed, "watching")).toHaveLength(0);
    expect(feed.observedAt).toBe(later.toISOString());
    expect(saved.demoCare!.asOf).toBe(tenProductPack.asOf);
  });
  it("answers source-backed retail and lower-price questions with exact purchase scope", () => {
    const feed = feedOf();
    const answer = careStatusAnswer(feed, 1, [demoId(205)], "retail-reference");
    expect(answer.steps[0]).toContain("$1,099.00");
    expect(answer.steps[0]).toContain("$1,199.00");
    expect(answer.sources[0].href).toContain("WRT311FZDW");
    const lower = careStatusAnswer(
      feed,
      2,
      feed.purchases.map((p) => p.id),
      "lower-reference",
    );
    expect(lower.careSelection).not.toContain(demoId(204));
    expect(lower.text).toContain("never establishes");
  });
  it("North closing windows and Care attention use the same simulated return evidence", () => {
    const feed = feedOf();
    const answer = careStatusAnswer(
      feed,
      1,
      feed.purchases.map((p) => p.id),
      "closing-windows",
    );
    expect(answer.careSelection?.sort()).toEqual([demoId(207), demoId(210)]);
    expect(
      answer.steps.every((s) => s.includes("Simulated examples as of")),
    ).toBe(true);
  });
  it("North closing windows excludes ended sample deadlines using the current UTC view clock", () => {
    const feed = feedOf(data(), new Date("2026-11-09T12:00:00Z"));
    const answer = careStatusAnswer(
      feed,
      1,
      feed.purchases.map((p) => p.id),
      "closing-windows",
    );
    expect(answer.careSelection).toEqual([]);
    expect(answer.steps).toEqual([]);
    expect(answer.outcome).toBe("missing");
    expect(answer.text).toContain("current UTC view time");
  });
  it("never represents the speaker notice as an official recall match", () => {
    const feed = feedOf();
    const safety = careStatusAnswer(feed, 1, [demoId(203)], "safety");
    expect(safety.steps.join(" ")).toContain(
      "No official recall match is established",
    );
    expect(
      safety.sources.some((s) => s.href === "https://www.cpsc.gov/Recalls"),
    ).toBe(true);
    expect(
      feed.ownership.find((v) => v.twinId === demoId(203))!.pill.label,
    ).toBe("Simulated notice");
  });
});
