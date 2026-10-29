import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerRecords } from "../../src/components/intelligence/customer-records";
import type { PurchaseTwin } from "../../src/db/schema";
import {
  projectActivity,
  type PurchaseActivity,
} from "../../src/lib/careos/activity";
import {
  referenceSource,
  REFERENCE_TWIN,
  type KnowledgeSource,
} from "../../src/lib/careos/knowledge";
import type { ProductSnapshot } from "../../src/lib/commerce/contracts";
import { demoData } from "../../src/lib/demo/fixtures";
import { customerDataset } from "../../src/lib/intelligence/customer-model";
import type {
  GuardianOverview,
  GuardianView,
} from "../../src/lib/price-guardian/contracts";
import { emptyOverview } from "../../src/lib/price-guardian/projections";

const mocks = vi.hoisted(() => ({
  data: vi.fn(),
  knowledge: vi.fn(),
  guardian: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../src/lib/demo/repository", () => ({ getDemoData: mocks.data }));
vi.mock("../../src/lib/careos/knowledge-repository", () => ({
  getKnowledge: mocks.knowledge,
}));
vi.mock("../../src/lib/price-guardian/runtime", () => ({
  getGuardian: mocks.guardian,
}));
vi.mock("../../src/lib/careos/activity-repository", () => ({
  getPurchaseActivity: mocks.activity,
}));

import { getCustomerIntelligence } from "../../src/lib/intelligence/customer-repository";

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const noActivity: PurchaseActivity = { items: [], unavailable: [] };
function databaseData() {
  const data = { ...structuredClone(demoData), source: "database" as const };
  const product: ProductSnapshot = {
    ...data.products[0],
    name: "Original headphones name",
    model: "F-01 original",
    priceMinor: 12900,
    currency: "USD",
    merchantName: data.merchant.name,
  };
  const twin: PurchaseTwin = {
    ...data.twins[0],
    id: id(205),
    purchasePriceMinor: product.priceMinor,
    origin: "sandbox",
    checkoutOrderId: id(501),
    paypalOrderId: "TESTORDER00000001",
    paypalCaptureId: "TESTCAPTURE000001",
    verifiedAt: "2026-10-22T23:02:01Z",
    productSnapshot: product,
    createdAt: "2026-10-22T23:02:01Z",
  };
  data.twins.unshift(twin);
  data.documents.push(
    {
      id: id(305),
      twinId: twin.id,
      title: "Saved Sandbox receipt",
      kind: "receipt",
      origin: "sandbox",
      content: "Synthetic unit fixture only, never provider proof.",
    },
    {
      id: id(306),
      twinId: twin.id,
      title: "Saved demo-v1 policy",
      kind: "policy",
      origin: "sample",
      content: "Synthetic saved policy, not coverage or refund approval.",
    },
  );
  return data;
}
function guardianCase(overrides: Partial<GuardianView> = {}): GuardianView {
  return {
    id: id(601),
    twinId: id(205),
    productName: "Untrusted current catalog name",
    createdAt: "2026-10-23T01:00:00Z",
    updatedAt: "2026-10-23T02:00:00Z",
    approvedAt: "2026-10-23T01:01:00Z",
    approvalExpiresAt: "2026-10-24T01:00:00Z",
    attemptedAt: "2026-10-23T01:02:00Z",
    checkedAt: "2026-10-23T02:00:00Z",
    state: "completed",
    revision: 1,
    originalMinor: 12900,
    comparedMinor: 10900,
    amountMinor: 2000,
    policyVersion: "test-v2",
    policyHash: "a".repeat(64),
    policyTerms: "Synthetic unit policy only.",
    priceOrigin: "controlled_demo",
    priceObservedAt: "2026-10-23T01:00:00Z",
    expiresAt: "2026-10-30T01:00:00Z",
    reason: "eligible",
    refundId: "TESTREFUND0000001",
    providerStatus: "COMPLETED",
    verifiedAt: "2026-10-23T02:00:00Z",
    history: [],
    ...overrides,
  };
}
function overview(cases: GuardianView[]): GuardianOverview {
  const result = emptyOverview();
  result.cases = cases;
  result.analytics.opportunities = 999;
  result.analytics.verifiedMinor = 999999;
  result.monitoring.lastCheck = "2026-10-23T02:00:00Z";
  return result;
}

describe("customer intelligence fixed purchase projection (synthetic evidence only)", () => {
  it("uses purchase amounts, one row per Twin, scoped documents and explicit sample origins", () => {
    const data = structuredClone(demoData);
    data.twins.push(data.twins[0]);
    data.documents.push(data.documents[0], data.documents[0]);
    data.events.push(data.events[0]);
    const result = customerDataset(
      data,
      [referenceSource],
      emptyOverview(),
      noActivity,
    );
    expect(result.source).toBe("fixtures");
    expect(result.purchases).toHaveLength(4);
    const headphones = result.purchases.find((row) => row.id === id(201))!;
    expect(headphones.amountMinor).toBe(14900);
    expect(headphones.documentCount).toBe(1);
    expect(headphones.documentLinks).toEqual([
      {
        title: data.documents[0].title,
        href: `/documents/${id(301)}`,
        origin: "sample",
      },
    ]);
    expect(headphones.receiptHref).toBe(`/documents/${id(301)}`);
    expect(result.purchases.every((row) => row.origin === "sample")).toBe(true);
    expect(
      result.purchases.every((row) => row.verifiedAdjustmentMinor === 0),
    ).toBe(true);
    expect(result.unavailable).toEqual([]);
    expect(result.adjustments).toMatchObject({
      mode: "recorded",
      facts: [],
      totalCases: 0,
      allVerifiedMinor: 0,
    });
  });

  it("does not turn the reference placeholder into free goods or invent missing documents/policies/attention", () => {
    const data = structuredClone(demoData);
    data.documents = [];
    const result = customerDataset(data, [], emptyOverview(), noActivity);
    expect(
      result.purchases.find((row) => row.id === REFERENCE_TWIN),
    ).toMatchObject({
      amountMinor: null,
      receiptHref: null,
      documentCount: 0,
      policyCount: 0,
      documentLinks: [],
      careAvailable: false,
      careStatus: "missing",
      careHref: null,
      attention: [],
      attentionCount: 0,
      attentionStatus: "available",
    });
    expect(result.unavailable).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(
      /warranty|returnDeadline|coverageEnds/,
    );
  });

  it("fails closed for foreign fixed identities, foreign Twins and broken product associations", () => {
    const data = structuredClone(demoData);
    data.twins.push(
      { ...data.twins[0], id: id(210), customerId: id(900) },
      { ...data.twins[0], id: id(211), merchantId: id(900) },
      { ...data.twins[0], id: id(212), productId: id(900) },
      { ...data.twins[0], id: "not-a-record-id" },
    );
    expect(
      customerDataset(data, [], emptyOverview(), noActivity).purchases,
    ).toHaveLength(4);
    data.customer.id = id(900);
    expect(
      customerDataset(data, [], emptyOverview(), noActivity),
    ).toMatchObject({
      purchases: [],
      unavailable: ["Purchase scope"],
    });
    data.customer.id = demoData.customer.id;
    data.merchant.id = id(900);
    expect(
      customerDataset(data, [], emptyOverview(), noActivity).purchases,
    ).toEqual([]);
  });

  it("retains snapshot identity and price when today's catalog changes without exposing payment references", () => {
    const data = databaseData();
    data.products[0].name = "Changed catalog name";
    data.products[0].model = "Changed model";
    data.products[0].priceMinor = 9900;
    const result = customerDataset(data, [], emptyOverview(), noActivity);
    expect(result.source).toBe("database");
    expect(result.purchases[0]).toMatchObject({
      id: id(205),
      name: "Original headphones name",
      model: "F-01 original",
      amountMinor: 12900,
      origin: "sandbox",
      currency: "USD",
      documentCount: 2,
      policyCount: 1,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("TESTORDER");
    expect(serialized).not.toContain("TESTCAPTURE");
    expect(serialized).not.toContain(id(501));
    expect(serialized).not.toContain("productSnapshot");
  });

  it.each([
    { checkoutOrderId: null },
    { paypalOrderId: null },
    { paypalCaptureId: null },
    { verifiedAt: null },
    { verifiedAt: "not-a-time" },
    { productSnapshot: null },
    { purchasePriceMinor: 9900 },
    { currency: "EUR" },
    { purchasePriceMinor: 129.5 },
  ])(
    "does not label incomplete or mismatching persisted evidence as Sandbox: %j",
    (change) => {
      const data = databaseData();
      Object.assign(data.twins[0], change);
      const result = customerDataset(data, [], emptyOverview(), noActivity);
      expect(result.purchases.every((row) => row.origin === "sample")).toBe(
        true,
      );
      expect(result.unavailable).toContain("Purchase evidence");
    },
  );

  it("validates snapshot product and merchant association, not just populated reference strings", () => {
    const data = databaseData();
    data.twins[0].productSnapshot!.merchantId = id(900);
    expect(
      customerDataset(data, [], emptyOverview(), noActivity).purchases,
    ).toHaveLength(4);
    data.twins[0].productSnapshot!.merchantId = demoData.merchant.id;
    data.twins[0].productSnapshot!.id = id(900);
    expect(
      customerDataset(data, [], emptyOverview(), noActivity).purchases,
    ).toHaveLength(4);
  });

  it("bounds purchases to the newest 100 distinct authorized Twins", () => {
    const data = structuredClone(demoData);
    data.twins = Array.from({ length: 105 }, (_, index) => ({
      ...data.twins[0],
      id: id(1000 + index),
      createdAt: `2026-10-18T12:00:${String(index % 60).padStart(2, "0")}Z`,
    }));
    const result = customerDataset(data, [], emptyOverview(), noActivity);
    expect(result.limit).toBe(100);
    expect(result.purchases).toHaveLength(100);
    expect(new Set(result.purchases.map((row) => row.id)).size).toBe(100);
  });
});

describe("customer exact-model care evidence", () => {
  it("offers only the approved, hash-valid exact product/brand/model guide", () => {
    const result = customerDataset(
      demoData,
      [referenceSource, referenceSource],
      emptyOverview(),
      noActivity,
    );
    expect(
      result.purchases.filter((row) => row.careAvailable).map((row) => row.id),
    ).toEqual([REFERENCE_TWIN]);
    expect(
      result.purchases.find((row) => row.id === REFERENCE_TWIN)?.careHref,
    ).toBe(`/vault/${REFERENCE_TWIN}/care`);
  });

  it.each(
    [
      [],
      [{ ...referenceSource, model: "4" }],
      [{ ...referenceSource, brand: "Other brand" }],
      [{ ...referenceSource, productId: id(999) }],
      [{ ...referenceSource, status: "withdrawn" as const }],
      [referenceSource, { ...referenceSource, status: "withdrawn" as const }],
      [{ ...referenceSource, status: "conflicting" as const }],
      [
        referenceSource,
        { ...referenceSource, id: id(502), status: "conflicting" as const },
      ],
      [{ ...referenceSource, content: "Changed after review" }],
      [{ ...referenceSource, url: "https://untrusted.example/manual" }],
    ].map((sources) => ({ sources })),
  )(
    "does not offer missing, foreign, withdrawn, conflicting or changed care: %#",
    ({ sources }) => {
      const result = customerDataset(
        demoData,
        sources as KnowledgeSource[],
        emptyOverview(),
        noActivity,
      );
      expect(
        result.purchases.every(
          (row) => !row.careAvailable && row.careHref === null,
        ),
      ).toBe(true);
    },
  );

  it("makes changed source integrity visibly unavailable without losing saved receipt facts", () => {
    const result = customerDataset(
      demoData,
      [{ ...referenceSource, contentHash: "a".repeat(64) }],
      emptyOverview(),
      noActivity,
    );
    expect(result.unavailable).toContain("Product care evidence");
    expect(
      result.purchases.find((row) => row.id === id(201))?.receiptHref,
    ).toBe(`/documents/${id(301)}`);
  });
});

describe("customer recorded adjustment window and attention", () => {
  it("excludes authorized but unloaded purchases instead of leaking lifetime Guardian totals", () => {
    const data = databaseData();
    data.twins.push({
      ...data.twins[0],
      id: id(206),
      createdAt: "2020-01-01T00:00:00Z",
    });
    data.twins.push(
      ...Array.from({ length: 100 }, (_, index) => ({
        ...demoData.twins[0],
        id: id(1000 + index),
      })),
    );
    const result = customerDataset(
      data,
      [],
      overview([guardianCase({ twinId: id(206) })]),
      noActivity,
    );
    expect(result.purchases).toHaveLength(100);
    expect(result.purchases.some((row) => row.id === id(206))).toBe(false);
    expect(result.adjustments).toMatchObject({
      facts: [],
      totalCases: 0,
      allVerifiedMinor: 0,
    });
    expect(result.adjustmentScope).toBe("loaded-purchase-window");
  });

  it("ignores all-record totals, sample cases and unrelated cases; deduplicates cases, refund identity and history", () => {
    const data = databaseData();
    const completed = guardianCase({
      history: [
        {
          id: id(701),
          kind: "refund.completed",
          at: "2026-10-23T02:00:00Z",
          detail: "Saved synthetic history",
        },
        {
          id: id(702),
          kind: "refund.completed",
          at: "2026-10-23T02:00:00Z",
          detail: "Repeated history, not another refund",
        },
      ],
    });
    const guardian = overview([
      completed,
      completed,
      { ...completed, id: id(602) },
      { ...completed, id: id(603), twinId: id(900) },
      { ...completed, id: id(604), twinId: id(201), originalMinor: 14900 },
    ]);
    const activity = projectActivity(data, guardian.cases);
    activity.items.push(...activity.items);
    const result = customerDataset(data, [], guardian, activity);
    expect(result.adjustmentScope).toBe("loaded-purchase-window");
    expect(result.adjustments).toMatchObject({
      totalCases: 1,
      allVerifiedMinor: 2000,
    });
    expect(result.adjustments.facts).toHaveLength(1);
    expect(result.adjustments.facts[0]).toMatchObject({
      stage: "Verified",
      evidence: "Independent verification",
      product: "Original headphones name",
    });
    expect(result.purchases.find((row) => row.id === id(205))).toMatchObject({
      verifiedAdjustmentMinor: 2000,
      adjustmentIds: [id(601)],
      attentionCount: 0,
      attention: [],
    });
    expect(
      result.purchases
        .filter((row) => row.origin === "sample")
        .every(
          (row) =>
            row.verifiedAdjustmentMinor === 0 && row.attentionCount === 0,
        ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("TESTREFUND");
  });

  it.each([
    { state: "pending" as const },
    { providerStatus: "PENDING" },
    { refundId: null },
    { refundId: "" },
    { verifiedAt: null },
    { verifiedAt: "not-a-time" },
  ])(
    "requires completed state, independent status, refund ID and valid time for totals: %j",
    (change) => {
      const data = databaseData();
      const saved = guardianCase(change);
      const result = customerDataset(
        data,
        [],
        overview([saved]),
        projectActivity(data, [saved]),
      );
      expect(result.adjustments.allVerifiedMinor).toBe(0);
      expect(result.adjustments.facts[0].stage).not.toBe("Verified");
      expect(result.purchases[0].verifiedAdjustmentMinor).toBe(0);
    },
  );

  it("takes the latest case revision and derives attention only from authorized saved activity", () => {
    const data = databaseData();
    const pending = guardianCase({
      state: "pending",
      providerStatus: "PENDING",
      verifiedAt: null,
      refundId: null,
      revision: 2,
    });
    const prior = { ...pending, revision: 1, state: "approved" as const };
    const activity = projectActivity(data, [pending]);
    const item = activity.items.find((value) =>
      value.id.startsWith("guardian-state:"),
    )!;
    activity.items.push(
      item,
      {
        ...item,
        id: "foreign-case",
        href: `/guardian/${id(999)}`,
        title: "Unrelated case",
      },
      { ...item, id: "foreign-twin", twinId: id(999), title: "Unrelated Twin" },
    );
    const result = customerDataset(
      data,
      [],
      overview([pending, prior]),
      activity,
    );
    expect(result.adjustments.facts[0].stage).toBe("Pending");
    expect(result.purchases[0].attention).toEqual([item.title]);
    expect(result.purchases[0].attentionCount).toBe(1);
    expect(
      customerDataset(data, [], overview([pending]), noActivity).purchases[0]
        .attention,
    ).toEqual([]);
  });

  it("retains saved recall attention while suppressing old attention on an independently completed refund", () => {
    const data = databaseData();
    const saved = guardianCase();
    const activity = projectActivity(
      data,
      [saved],
      [
        {
          id: id(801),
          twinId: saved.twinId,
          state: "possible_match",
          reason: "Verify physical model",
          at: "2026-10-24T00:00:00Z",
          hash: "a".repeat(64),
        },
      ],
    );
    const result = customerDataset(data, [], overview([saved]), activity);
    expect(result.purchases[0].attention).toEqual([
      "Saved recall assessment · possible match",
    ]);
    expect(result.purchases[0].attentionCount).toBe(1);
  });

  it("distinguishes unavailable optional evidence from a successfully loaded empty dataset", () => {
    const result = customerDataset(
      demoData,
      [],
      null,
      { items: [], unavailable: ["Recall Guardian", "Price Guardian"] },
      ["Product care", "Product care"],
    );
    expect(result.unavailable).toEqual([
      "Product care",
      "Recall Guardian",
      "Price Guardian",
    ]);
    expect(result.adjustments).toMatchObject({
      facts: [],
      allVerifiedMinor: 0,
      totalCases: 0,
    });
    expect(result.purchases).toHaveLength(4);
    expect(
      customerDataset(demoData, [], emptyOverview(), noActivity).unavailable,
    ).toEqual([]);
  });
});

describe("customer intelligence repository dependency isolation (mock readers, no database/provider calls)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.data.mockResolvedValue(databaseData());
    mocks.knowledge.mockResolvedValue([referenceSource]);
    mocks.guardian.mockResolvedValue(emptyOverview());
    mocks.activity.mockResolvedValue(noActivity);
  });

  it("assembles the existing readers and retains database provenance", async () => {
    const result = await getCustomerIntelligence();
    expect(result.source).toBe("database");
    expect(result.purchases).toHaveLength(5);
    expect(mocks.data).toHaveBeenCalledWith();
    expect(mocks.knowledge).toHaveBeenCalledOnce();
    expect(mocks.guardian).toHaveBeenCalledWith();
    expect(mocks.activity).toHaveBeenCalledWith(
      expect.objectContaining({ source: "database" }),
    );
    expect(result.unavailable).toEqual([]);
  });

  it.each(["knowledge", "guardian", "activity"] as const)(
    "isolates %s failure without substituting fixtures or dropping receipts",
    async (dependency) => {
      mocks[dependency].mockRejectedValue(
        new Error("PRIVATE DIAGNOSTIC postgresql://secret"),
      );
      const result = await getCustomerIntelligence();
      expect(result.source).toBe("database");
      expect(result.purchases[0].origin).toBe("sandbox");
      expect(result.purchases[0].receiptHref).toBe(`/documents/${id(305)}`);
      expect(result.unavailable).toContain(
        {
          knowledge: "Product care",
          guardian: "Price Guardian",
          activity: "Purchase activity",
        }[dependency],
      );
      expect(result.evidenceAvailable).toEqual({
        care: dependency !== "knowledge",
        attention: dependency === "knowledge",
        adjustments: dependency !== "guardian",
      });
      expect(result.purchases[0].attentionStatus).toBe(
        dependency === "knowledge" ? "available" : "unavailable",
      );
      if (dependency === "knowledge")
        expect(
          result.purchases.every(
            (purchase) => purchase.careStatus === "unavailable",
          ),
        ).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(
        /PRIVATE DIAGNOSTIC|postgresql:|secret/,
      );
      for (const dependency of [
        mocks.knowledge,
        mocks.guardian,
        mocks.activity,
      ])
        expect(dependency).toHaveBeenCalledOnce();
    },
  );

  it("handles simultaneous/synchronous optional failures and keeps partial activity provenance", async () => {
    mocks.knowledge.mockImplementation(() => {
      throw new Error("Injected synchronous failure");
    });
    mocks.guardian.mockRejectedValue(new Error("Injected Guardian failure"));
    mocks.activity.mockResolvedValue({
      items: [],
      unavailable: ["Recall Guardian", "Price Guardian"],
    });
    const result = await getCustomerIntelligence();
    expect(new Set(result.unavailable)).toEqual(
      new Set(["Product care", "Price Guardian", "Recall Guardian"]),
    );
    expect(result.purchases).toHaveLength(5);
    expect(result.evidenceAvailable).toEqual({
      care: false,
      attention: false,
      adjustments: false,
    });
  });

  it("keeps independently loaded adjustments usable when the activity reader has a Guardian outage", async () => {
    mocks.guardian.mockResolvedValue(overview([guardianCase()]));
    mocks.activity.mockResolvedValue({
      items: [],
      unavailable: ["Price Guardian"],
    });
    const result = await getCustomerIntelligence();
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: false,
      adjustments: true,
    });
    expect(result.adjustments.allVerifiedMinor).toBe(2000);
    expect(result.purchases[0]).toMatchObject({
      attentionStatus: "unavailable",
      attentionCount: 0,
      adjustmentIds: [id(601)],
      verifiedAdjustmentMinor: 2000,
    });
  });

  it("redacts required database failure and never invokes optional readers or returns sample records", async () => {
    mocks.data.mockRejectedValue(
      new Error("postgresql://private:secret@database/actual"),
    );
    await expect(getCustomerIntelligence()).rejects.toThrow(
      "Customer purchase records are unavailable. No fixture fallback was substituted.",
    );
    expect(mocks.knowledge).not.toHaveBeenCalled();
    expect(mocks.guardian).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
  });
});

describe("customer evidence availability is not a zero-result conclusion", () => {
  it("distinguishes reliable empty evidence from an unavailable dependency", () => {
    const result = customerDataset(demoData, [], emptyOverview(), noActivity);
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: true,
      adjustments: true,
    });
    expect(
      result.purchases.every((purchase) => purchase.careStatus === "missing"),
    ).toBe(true);
    expect(
      result.purchases.every(
        (purchase) =>
          purchase.attentionStatus === "available" &&
          purchase.attentionCount === 0,
      ),
    ).toBe(true);
  });

  it.each([
    { failure: "Recall Guardian", care: true, adjustments: true },
    { failure: "Price Guardian", care: true, adjustments: true },
    { failure: "Purchase activity", care: true, adjustments: true },
    { failure: "Purchase activity evidence", care: true, adjustments: true },
  ])(
    "keeps unrelated evidence independent of partial activity: $failure",
    ({ failure, care, adjustments }) => {
      const result = customerDataset(
        demoData,
        [referenceSource],
        emptyOverview(),
        { items: [], unavailable: [failure] },
      );
      expect(result.evidenceAvailable).toEqual({
        care,
        adjustments,
        attention: false,
      });
      expect(
        result.purchases.find((purchase) => purchase.id === REFERENCE_TWIN)
          ?.careStatus,
      ).toBe("available");
      expect(
        result.purchases.every(
          (purchase) => purchase.attentionStatus === "unavailable",
        ),
      ).toBe(true);
    },
  );

  it("marks every care status unknown during a global source outage without losing saved documents", () => {
    const result = customerDataset(
      databaseData(),
      [],
      emptyOverview(),
      noActivity,
      ["Product care"],
    );
    expect(result.evidenceAvailable).toEqual({
      care: false,
      attention: true,
      adjustments: true,
    });
    expect(
      result.purchases.every(
        (purchase) =>
          purchase.careStatus === "unavailable" &&
          !purchase.careAvailable &&
          purchase.careHref === null,
      ),
    ).toBe(true);
    expect(result.purchases[0]).toMatchObject({
      documentCount: 2,
      receiptHref: `/documents/${id(305)}`,
    });
  });

  it("retains partial known attention without implying there are no further items", () => {
    const data = databaseData();
    const activity = projectActivity(
      data,
      [],
      [
        {
          id: id(801),
          twinId: id(205),
          state: "possible_match",
          reason: "Verify physical model",
          at: "2026-10-24T00:00:00Z",
          hash: "a".repeat(64),
        },
      ],
      ["Price Guardian"],
    );
    const result = customerDataset(data, [], emptyOverview(), activity);
    expect(result.evidenceAvailable.attention).toBe(false);
    expect(result.purchases[0]).toMatchObject({
      attentionStatus: "unavailable",
      attentionCount: 1,
      attention: ["Saved recall assessment · possible match"],
    });
  });

  it.each([
    { ...referenceSource, contentHash: "a".repeat(64) },
    { ...referenceSource, content: "Changed source content" },
    { ...referenceSource, status: "conflicting" as const },
    { ...referenceSource, status: "withdrawn" as const },
    { ...referenceSource, model: "4" },
  ])(
    "does not hide conflicting source identity behind a valid duplicate: %j",
    (changed) => {
      const result = customerDataset(
        demoData,
        [referenceSource, changed],
        emptyOverview(),
        noActivity,
      );
      expect(result.evidenceAvailable).toEqual({
        care: false,
        attention: true,
        adjustments: true,
      });
      expect(result.unavailable).toContain("Product care evidence");
      expect(
        result.purchases.find((purchase) => purchase.id === REFERENCE_TWIN),
      ).toMatchObject({
        careStatus: "unavailable",
        careAvailable: false,
        careHref: null,
      });
      expect(
        result.purchases.find((purchase) => purchase.id === id(201))
          ?.careStatus,
      ).toBe("missing");
    },
  );

  it("keeps a reliably withdrawn source distinct from an ambiguous duplicate or source outage", () => {
    const result = customerDataset(
      demoData,
      [{ ...referenceSource, status: "withdrawn" }],
      emptyOverview(),
      noActivity,
    );
    expect(result.evidenceAvailable.care).toBe(true);
    expect(
      result.purchases.find((purchase) => purchase.id === REFERENCE_TWIN)
        ?.careStatus,
    ).toBe("missing");
  });

  it("does not let a conflicting latest case duplicate establish complete totals", () => {
    const data = databaseData();
    const saved = guardianCase();
    const result = customerDataset(
      data,
      [],
      overview([saved, { ...saved, amountMinor: 1500 }]),
      projectActivity(data, [saved]),
    );
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: false,
      adjustments: false,
    });
    expect(result.unavailable).toContain("Price Guardian evidence");
    expect(result.purchases[0]).toMatchObject({
      adjustmentIds: [],
      verifiedAdjustmentMinor: 0,
      attentionStatus: "unavailable",
    });
    expect(result.adjustments.facts).toEqual([]);
  });

  it("rejects contradictory refund amounts instead of counting either duplicate identity", () => {
    const result = customerDataset(
      databaseData(),
      [],
      overview([
        guardianCase(),
        guardianCase({ id: id(602), amountMinor: 1500 }),
      ]),
      noActivity,
    );
    expect(result.evidenceAvailable.adjustments).toBe(false);
    expect(result.evidenceAvailable.attention).toBe(false);
    expect(result.adjustments.allVerifiedMinor).toBe(0);
    expect(result.adjustments.facts).toEqual([]);
  });

  it("retains exact duplicate cases/history as reliable single evidence", () => {
    const saved = guardianCase();
    const result = customerDataset(
      databaseData(),
      [referenceSource, referenceSource],
      overview([
        saved,
        {
          ...saved,
          history: [
            {
              id: id(701),
              kind: "refund.completed",
              at: saved.updatedAt,
              detail: "Repeated history is not another adjustment",
            },
          ],
        },
      ]),
      noActivity,
    );
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: true,
      adjustments: true,
    });
    expect(result.adjustments.allVerifiedMinor).toBe(2000);
    expect(result.purchases[0].adjustmentIds).toEqual([saved.id]);
  });

  it("marks incomplete completion evidence unavailable rather than a definitive zero-refund finding", () => {
    const result = customerDataset(
      databaseData(),
      [],
      overview([guardianCase({ verifiedAt: "not-a-time" })]),
      noActivity,
    );
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: false,
      adjustments: false,
    });
    expect(result.adjustments.facts[0].stage).toBe("Unresolved");
    expect(result.adjustments.allVerifiedMinor).toBe(0);
  });

  it("does not overwrite conflicting saved activity with a zero-attention duplicate", () => {
    const data = databaseData();
    const saved = guardianCase({
      state: "pending",
      providerStatus: "PENDING",
      refundId: null,
      verifiedAt: null,
    });
    const activity = projectActivity(data, [saved]);
    const item = activity.items.find((value) =>
      value.id.startsWith("guardian-state:"),
    )!;
    activity.items.push({ ...item, attention: false });
    const result = customerDataset(data, [], overview([saved]), activity);
    expect(result.evidenceAvailable).toEqual({
      care: true,
      attention: false,
      adjustments: true,
    });
    expect(result.unavailable).toContain("Purchase activity evidence");
    expect(result.purchases[0]).toMatchObject({
      attentionStatus: "unavailable",
      attentionCount: 0,
    });
  });

  it("does not project contradictory purchase duplicates as a complete purchase window", () => {
    const data = databaseData();
    data.twins.push({ ...data.twins[0], purchasePriceMinor: 9900 });
    const result = customerDataset(data, [], emptyOverview(), noActivity);
    expect(result.unavailable).toContain("Purchase evidence");
    expect(result.evidenceAvailable).toEqual({
      care: false,
      attention: false,
      adjustments: false,
    });
    expect(result.purchases.some((purchase) => purchase.id === id(205))).toBe(
      false,
    );
  });
});

describe("customer source cards distinguish unavailable from missing (static rendering only)", () => {
  it.each([false, true])(
    "shows outage and partial labels while preserving provenance and receipt links, compact=%s",
    (compact) => {
      const result = customerDataset(
        databaseData(),
        [],
        null,
        { items: [], unavailable: ["Purchase activity"] },
        ["Product care"],
      );
      const markup = renderToStaticMarkup(
        createElement(CustomerRecords, {
          purchases: result.purchases,
          compact,
        }),
      );
      expect(markup).toContain(
        "Product-care evidence is unavailable or requires review",
      );
      expect(markup).toContain("Aftercare evidence is incomplete");
      expect(markup).toContain(
        "no conclusion that nothing needs attention is established",
      );
      expect(markup).not.toContain(
        "No supported manufacturer guidance recorded",
      );
      expect(markup).not.toContain(
        "Return and warranty dates are not documented",
      );
      expect(markup).toContain("Verified Sandbox purchase");
      expect(markup).toContain("Sample purchase");
      expect(markup).toContain(`href="/documents/${id(305)}"`);
      if (!compact) {
        expect(markup).toContain("Sandbox receipt");
        expect(markup).toContain("Sample document");
      }
    },
  );

  it("uses the missing label only after a successful care read and keeps valid guidance available", () => {
    const result = customerDataset(
      demoData,
      [referenceSource],
      emptyOverview(),
      noActivity,
    );
    const markup = renderToStaticMarkup(
      createElement(CustomerRecords, { purchases: result.purchases }),
    );
    expect(markup).toContain("No supported manufacturer guidance recorded");
    expect(markup).toContain("Exact-model care guidance available");
    expect(markup).toContain(`href="/vault/${REFERENCE_TWIN}/care"`);
    expect(markup).not.toContain("Aftercare evidence is incomplete");
  });
});
