import type { DemoData } from "../../db/schema";
import { careContextSchema, contextOf, type PurchaseChoice } from "./contracts";
import { findTwin } from "../demo/presentation";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";
import { productSnapshotSchema, providerIdSchema } from "../commerce/contracts";
import { recordIdSchema } from "../demo/presentation";

/** Same public fictional scope as Purchases. No actor IDs, queries or model calls. */
export function contextChoices(data: DemoData): PurchaseChoice[] {
  if (
    data.customer.id !== CUSTOMER_ID ||
    data.customer.kind !== "fictional" ||
    data.merchant.id !== MERCHANT_ID ||
    data.merchant.kind !== "fictional"
  )
    return [];
  const conflicting = new Set(
    data.twins
      .filter((twin) =>
        data.twins.some(
          (other) =>
            other.id === twin.id &&
            JSON.stringify(other) !== JSON.stringify(twin),
        ),
      )
      .map((twin) => twin.id),
  );
  return [...new Map(data.twins.map((twin) => [twin.id, twin])).values()]
    .flatMap((twin): PurchaseChoice[] => {
      const record = findTwin(data, twin.id);
      if (!record || conflicting.has(twin.id)) return [];
      const snapshot = productSnapshotSchema.safeParse(twin.productSnapshot);
      const evidence =
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
            !!twin.verifiedAt &&
            Number.isFinite(Date.parse(twin.verifiedAt)) &&
            snapshot.success &&
            snapshot.data.id === twin.productId &&
            snapshot.data.merchantId === twin.merchantId &&
            snapshot.data.priceMinor === twin.purchasePriceMinor;
      const context = careContextSchema.safeParse(contextOf(record));
      return evidence &&
        context.success &&
        !!context.data.purchasedOn &&
        twin.currency === "USD" &&
        Number.isSafeInteger(twin.purchasePriceMinor) &&
        twin.purchasePriceMinor >= 0
        ? [
            {
              context: context.data,
              purchasedOn: record.twin.purchasedOn,
              provenance:
                record.twin.origin === "sandbox"
                  ? "Verified Sandbox"
                  : "Sample",
            },
          ]
        : [];
    })
    .slice(0, 100);
}
