import type { GuardianView } from "../price-guardian/contracts";
export type CareResolution = {
  known: string;
  missing: string;
  next: string;
  finished: string;
};
export function adjustmentResolution(item?: GuardianView): CareResolution {
  if (!item)
    return {
      known: "No recorded adjustment for this purchase.",
      missing:
        "A recorded eligible adjustment; legacy demo-v1 purchases are not retroactively covered.",
      next: "No customer action is required. Review the saved purchase policy if needed.",
      finished: "No refund is promised or submitted by this conversation.",
    };
  const verified =
    item.state === "completed" &&
    item.providerStatus === "COMPLETED" &&
    !!item.refundId &&
    !!item.verifiedAt;
  return {
    known: verified
      ? "Refund independently verified in PayPal Sandbox."
      : `Recorded adjustment: ${item.state.replaceAll("_", " ")}. This is not a completed refund.`,
    missing: verified
      ? "No missing refund-verification evidence in this record."
      : item.state === "awaiting_approval"
        ? "Merchant approval and independent refund verification."
        : "A provider-verified completed outcome; pending or uncertain is not completed.",
    next: verified
      ? "No further customer action is required for this adjustment. Keep the original receipt."
      : item.state === "awaiting_approval"
        ? "No customer action is required. The merchant must approve; no refund has been submitted yet."
        : item.state === "approved"
          ? "The merchant must execute the separately authorized refund. Approval alone moves no money."
          : ["submitting", "unknown", "pending"].includes(item.state)
            ? "The merchant must verify the existing submission. Do not send a second refund."
            : "The merchant must review the recorded evidence before any further action. No automatic retry.",
    finished:
      "Only an independently retrieved, validated completed Sandbox refund counts as finished. This conversation cannot perform it.",
  };
}
