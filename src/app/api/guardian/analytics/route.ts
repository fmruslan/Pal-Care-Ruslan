import { getGuardian } from "@/lib/price-guardian/runtime";
import { guardianResponse, guardianError } from "@/lib/operator/http";
export async function GET() {
  try {
    const overview = await getGuardian();
    return guardianResponse({
      version: "guardian-analytics-v1",
      currency: "USD",
      scope:
        "Fixed demo merchant. Totals include all recorded Guardian cases; no illustrative scenarios.",
      factsWindow: "500 newest cases",
      metrics: overview.analytics,
      facts: overview.cases.map((c) => ({
        caseId: c.id,
        twinId: c.twinId,
        product: c.productName,
        state: c.state,
        revision: c.revision,
        policyVersion: c.policyVersion,
        reason: c.reason,
        originalMinor: c.originalMinor,
        comparedMinor: c.comparedMinor,
        adjustmentMinor: c.amountMinor,
        createdAt: c.createdAt,
        approvedAt: c.approvedAt,
        approvalExpiresAt: c.approvalExpiresAt,
        attemptedAt: c.attemptedAt,
        checkedAt: c.checkedAt,
        verifiedAt: c.verifiedAt,
        providerStatus: c.providerStatus,
        priceOrigin: c.priceOrigin,
        verifiedRefundMinor:
          c.state === "completed" &&
          c.providerStatus === "COMPLETED" &&
          c.verifiedAt
            ? c.amountMinor
            : 0,
        caseHref: `/guardian/${c.id}`,
        twinHref: `/vault/${c.twinId}`,
      })),
    });
  } catch (error) {
    return guardianError(error);
  }
}
