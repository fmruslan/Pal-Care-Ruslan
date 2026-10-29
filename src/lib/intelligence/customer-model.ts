import { createHash } from "node:crypto";
import type { DemoData, PurchaseTwin } from "../../db/schema";
import type { PurchaseActivity } from "../careos/activity";
import { sourceSchema, type KnowledgeSource } from "../careos/knowledge";
import { productSnapshotSchema, providerIdSchema } from "../commerce/contracts";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";
import { findTwin, recordIdSchema } from "../demo/presentation";
import type {
  GuardianOverview,
  GuardianView,
} from "../price-guardian/contracts";
import { emptyOverview, summarize } from "../price-guardian/projections";
import { recordedDataset, type IntelligenceDataset } from "./model";

export type CustomerPurchase = {
  id: string;
  name: string;
  model: string;
  category: string;
  /** Decorative, known catalog artwork only; never a remote image URL. */
  illustration?: "headphones" | "kettle" | "speaker" | "computer";
  purchasedOn: string;
  origin: "sample" | "sandbox";
  amountMinor: number | null;
  currency: "USD";
  receiptHref: string | null;
  href: string;
  documentCount: number;
  policyCount: number;
  /** Compatibility value: use careStatus before concluding guidance is missing. */
  careAvailable: boolean;
  careStatus: "available" | "missing" | "unavailable";
  careHref: string | null;
  /** Count of loaded reasons only; not an all-clear when attention is unavailable. */
  attentionCount: number;
  attentionStatus: "available" | "unavailable";
  attention: string[];
  documentLinks: { title: string; href: string; origin: string }[];
  verifiedAdjustmentMinor: number;
  adjustmentIds: string[];
};

export type CustomerDataset = {
  source: "fixtures" | "database";
  purchases: CustomerPurchase[];
  adjustments: IntelligenceDataset;
  unavailable: string[];
  /** False means partial/unavailable, never a reliable zero-result finding. */
  evidenceAvailable: {
    care: boolean;
    attention: boolean;
    adjustments: boolean;
  };
  limit: number;
  /** Both adjustment facts and totals cover loaded purchases, never lifetime. */
  adjustmentScope?: "loaded-purchase-window";
};

const PURCHASE_LIMIT = 100;
const timestamp = (value: string | null) =>
  !!value && Number.isFinite(Date.parse(value));
const unique = <T extends { id: string }>(rows: T[]) => [
  ...new Map(rows.map((row) => [row.id, row])).values(),
];
const hasFailure = (values: Iterable<string>, dependency: string) =>
  [...values].some(
    (value) => value === dependency || value.startsWith(`${dependency} `),
  );
function conflictingIds<T extends { id: string }>(
  rows: T[],
  evidence: (row: T) => string,
) {
  const versions = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const row of rows) {
    const version = evidence(row);
    if (versions.has(row.id) && versions.get(row.id) !== version)
      conflicts.add(row.id);
    versions.set(row.id, version);
  }
  return conflicts;
}

function twinEvidence(value: PurchaseTwin) {
  const snapshot = productSnapshotSchema.safeParse(value.productSnapshot);
  return JSON.stringify([
    value.customerId,
    value.merchantId,
    value.productId,
    value.purchasedOn,
    value.purchasePriceMinor,
    value.currency,
    value.origin,
    value.checkoutOrderId,
    value.paypalOrderId,
    value.paypalCaptureId,
    value.verifiedAt,
    snapshot.success ? snapshot.data : value.productSnapshot,
    value.createdAt,
  ]);
}

// History rows do not multiply or redefine the saved financial fact.
function caseEvidence(value: GuardianView) {
  return JSON.stringify([
    value.twinId,
    value.revision,
    value.state,
    value.originalMinor,
    value.comparedMinor,
    value.amountMinor,
    value.policyVersion,
    value.policyHash,
    value.refundId,
    value.providerStatus,
    value.verifiedAt,
    value.checkedAt,
    value.updatedAt,
  ]);
}

function verifiedRefund(value: GuardianView) {
  return (
    value.state === "completed" &&
    value.providerStatus === "COMPLETED" &&
    providerIdSchema.safeParse(value.refundId).success &&
    timestamp(value.verifiedAt)
  );
}

/** Fixed fictional scope, read-only projection. No catalog price is a paid price. */
export function customerDataset(
  data: DemoData,
  sources: KnowledgeSource[],
  guardian: GuardianOverview | null,
  activity: PurchaseActivity,
  unavailable: string[] = [],
): CustomerDataset {
  const missing = new Set([...unavailable, ...activity.unavailable]);
  if (!guardian) missing.add("Price Guardian");
  const fixedScope =
    data.customer.id === CUSTOMER_ID &&
    data.customer.kind === "fictional" &&
    data.merchant.id === MERCHANT_ID &&
    data.merchant.kind === "fictional";
  if (!fixedScope) missing.add("Purchase scope");
  const conflictingTwins = conflictingIds(data.twins, twinEvidence);

  const records = fixedScope
    ? unique(data.twins)
        .map((twin) => findTwin(data, twin.id))
        .filter((record) => {
          if (!record) return false;
          const { twin } = record;
          if (conflictingTwins.has(twin.id)) {
            missing.add("Purchase evidence");
            return false;
          }
          const amountValid =
            twin.currency === "USD" &&
            Number.isSafeInteger(twin.purchasePriceMinor) &&
            twin.purchasePriceMinor >= 0;
          const snapshot = productSnapshotSchema.safeParse(
            twin.productSnapshot,
          );
          const provenanceValid =
            twin.origin === "sample"
              ? !twin.checkoutOrderId &&
                !twin.paypalOrderId &&
                !twin.paypalCaptureId &&
                !twin.verifiedAt &&
                !twin.productSnapshot
              : twin.origin === "sandbox" &&
                recordIdSchema.safeParse(twin.checkoutOrderId).success &&
                providerIdSchema.safeParse(twin.paypalOrderId).success &&
                providerIdSchema.safeParse(twin.paypalCaptureId).success &&
                timestamp(twin.verifiedAt) &&
                snapshot.success &&
                snapshot.data.id === twin.productId &&
                snapshot.data.merchantId === twin.merchantId &&
                snapshot.data.priceMinor === twin.purchasePriceMinor;
          if (!amountValid || !provenanceValid)
            missing.add("Purchase evidence");
          return amountValid && provenanceValid;
        })
        .filter((record) => record !== undefined)
        .sort(
          (a, b) =>
            b.twin.createdAt.localeCompare(a.twin.createdAt) ||
            a.twin.id.localeCompare(b.twin.id),
        )
        .slice(0, PURCHASE_LIMIT)
    : [];
  const sandbox = new Map(
    records
      .filter((record) => record.twin.origin === "sandbox")
      .map((record) => [record.twin.id, record]),
  );
  const refundIds = new Set<string>();
  const conflictingRefunds = new Set<string>();
  const savedCases = guardian?.cases ?? [];
  const cases: GuardianView[] = [];
  for (const saved of unique(
    [...savedCases].sort(
      (a, b) =>
        a.revision - b.revision || a.updatedAt.localeCompare(b.updatedAt),
    ),
  )) {
    const record = sandbox.get(saved.twinId);
    if (!record) {
      if (
        savedCases.some(
          (value) => value.id === saved.id && sandbox.has(value.twinId),
        )
      )
        missing.add("Price Guardian evidence");
      continue;
    }
    if (
      savedCases.some(
        (value) =>
          value.id === saved.id &&
          value.revision === saved.revision &&
          caseEvidence(value) !== caseEvidence(saved),
      )
    ) {
      missing.add("Price Guardian evidence");
      continue;
    }
    if (saved.state === "completed" && !verifiedRefund(saved))
      missing.add("Price Guardian evidence");
    const current = {
      ...saved,
      productName: record.product.name,
      // A completion label without independent, dated evidence stays unresolved.
      state:
        saved.state === "completed" && !verifiedRefund(saved)
          ? ("review" as const)
          : saved.state,
    };
    try {
      recordedDataset({ ...emptyOverview(), cases: [current] });
      if (
        !recordIdSchema.safeParse(current.id).success ||
        current.originalMinor !== record.twin.purchasePriceMinor ||
        current.amountMinor > current.originalMinor
      )
        throw new Error("Invalid adjustment evidence.");
    } catch {
      missing.add("Price Guardian evidence");
      continue;
    }
    if (current.refundId && refundIds.has(current.refundId)) {
      const duplicate = cases.find(
        (value) => value.refundId === current.refundId,
      );
      if (duplicate && caseEvidence(duplicate) !== caseEvidence(current)) {
        conflictingRefunds.add(current.refundId);
        missing.add("Price Guardian evidence");
      }
      continue;
    }
    if (current.refundId) refundIds.add(current.refundId);
    cases.push(current);
  }
  // Do not choose one amount/Twin arbitrarily when a refund identity conflicts.
  const validCases = cases.filter(
    (value) => !value.refundId || !conflictingRefunds.has(value.refundId),
  );
  const adjustments = recordedDataset({
    cases: validCases,
    monitoring: guardian?.monitoring ?? emptyOverview().monitoring,
    analytics: summarize(validCases),
  });
  const scopeAvailable =
    fixedScope && !hasFailure(missing, "Purchase evidence");
  const careReadAvailable =
    scopeAvailable && !hasFailure(missing, "Product care");
  const conflictingSources = conflictingIds(sources, (source) => {
    const parsed = sourceSchema.safeParse(source);
    return JSON.stringify(parsed.success ? parsed.data : source);
  });
  const conflictingActivity = conflictingIds(activity.items, (item) =>
    JSON.stringify([
      item.twinId,
      item.kind,
      item.at,
      item.title,
      item.detail,
      item.provenance,
      item.verified,
      item.attention,
      item.href,
    ]),
  );
  if (
    activity.items.some(
      (item) =>
        conflictingActivity.has(item.id) &&
        records.some((record) => record.twin.id === item.twinId),
    )
  )
    missing.add("Purchase activity evidence");
  const purchases = records.map(({ twin, product, documents }) => {
    const docs = unique(documents).filter(
      (doc) =>
        recordIdSchema.safeParse(doc.id).success &&
        ["receipt", "care-card", "policy"].includes(doc.kind) &&
        (doc.origin === "sample" ||
          (doc.origin === "sandbox" &&
            twin.origin === "sandbox" &&
            doc.kind === "receipt")),
    );
    const scopedSources = sources.filter(
      (source) =>
        source.productId === product.id &&
        source.brand === product.brand &&
        source.model === product.model,
    );
    const withdrawn = new Set(
      scopedSources
        .filter((source) => source.status === "withdrawn")
        .map((source) => source.id),
    );
    const matched = scopedSources.filter((source) => !withdrawn.has(source.id));
    const validSources = scopedSources.every(
      (source) =>
        !conflictingSources.has(source.id) &&
        source.status !== "conflicting" &&
        sourceSchema.safeParse(source).success &&
        createHash("sha256").update(source.content).digest("hex") ===
          source.contentHash,
    );
    if (!validSources) missing.add("Product care evidence");
    const careStatus: CustomerPurchase["careStatus"] =
      !careReadAvailable || !validSources
        ? "unavailable"
        : matched.length > 0
          ? "available"
          : "missing";
    const careAvailable = careStatus === "available";
    const attention = unique(activity.items)
      .filter((item) => {
        if (
          item.twinId !== twin.id ||
          !item.attention ||
          conflictingActivity.has(item.id)
        )
          return false;
        if (item.kind !== "refund" && !item.href.startsWith("/guardian/"))
          return true;
        const current = validCases.find(
          (value) =>
            value.twinId === twin.id && item.href === `/guardian/${value.id}`,
        );
        return !!current && !verifiedRefund(current) && !item.verified;
      })
      .map((item) => item.title);
    const reasons = [...new Set(attention)];
    const receipt = docs.find((doc) => doc.kind === "receipt");
    return {
      id: twin.id,
      name: product.name,
      model: product.model,
      category: product.category,
      illustration: (
        ["headphones", "kettle", "speaker", "computer"] as const
      ).find((kind) => kind === product.illustration),
      purchasedOn: twin.purchasedOn,
      origin: twin.origin as "sample" | "sandbox",
      // Zero on the reference ownership record is a placeholder, not free goods.
      amountMinor: twin.purchasePriceMinor > 0 ? twin.purchasePriceMinor : null,
      currency: "USD" as const,
      receiptHref: receipt ? `/documents/${receipt.id}` : null,
      href: `/vault/${twin.id}`,
      documentCount: docs.length,
      policyCount: docs.filter((doc) => doc.kind === "policy").length,
      careAvailable,
      careStatus,
      careHref: careAvailable ? `/vault/${twin.id}/care` : null,
      attentionCount: reasons.length,
      attention: reasons,
      documentLinks: docs.map((doc) => ({
        title: doc.title,
        href: `/documents/${doc.id}`,
        origin: doc.origin,
      })),
      verifiedAdjustmentMinor: validCases
        .filter((value) => value.twinId === twin.id && verifiedRefund(value))
        .reduce((total, value) => total + value.amountMinor, 0),
      adjustmentIds: validCases
        .filter((value) => value.twinId === twin.id)
        .map((value) => value.id),
    };
  });
  const adjustmentsAvailable =
    scopeAvailable &&
    guardian !== null &&
    !hasFailure(unavailable, "Price Guardian") &&
    !hasFailure(missing, "Price Guardian evidence");
  const evidenceAvailable = {
    care: careReadAvailable && !hasFailure(missing, "Product care evidence"),
    attention:
      adjustmentsAvailable &&
      !hasFailure(missing, "Purchase activity") &&
      !hasFailure(missing, "Recall Guardian") &&
      !hasFailure(activity.unavailable, "Price Guardian"),
    adjustments: adjustmentsAvailable,
  };
  return {
    source:
      (data as DemoData & { source?: "fixtures" | "database" }).source ??
      "fixtures",
    purchases: purchases.map((purchase): CustomerPurchase => ({
      ...purchase,
      attentionStatus: evidenceAvailable.attention
        ? "available"
        : "unavailable",
    })),
    adjustments,
    unavailable: [...missing],
    evidenceAvailable,
    limit: PURCHASE_LIMIT,
    adjustmentScope: "loaded-purchase-window",
  };
}
