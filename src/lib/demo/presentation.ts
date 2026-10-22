import { z } from "zod";
import type { DemoData } from "../../db/schema";

export const recordIdSchema = z.uuid();

export function money(amountMinor: number, currency = "USD") {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    currency !== "USD"
  )
    throw new Error("Unsupported monetary value.");
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amountMinor / 100,
  );
}

export function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export function findTwin(data: DemoData, id: string) {
  if (!recordIdSchema.safeParse(id).success) return undefined;
  const twin = data.twins.find(
    (record) =>
      record.id === id &&
      record.customerId === data.customer.id &&
      record.merchantId === data.merchant.id,
  );
  if (!twin) return undefined;
  const catalogProduct = data.products.find(
    (record) =>
      record.id === twin.productId && record.merchantId === twin.merchantId,
  );
  if (!catalogProduct) return undefined;
  const product = twin.productSnapshot
    ? { ...catalogProduct, ...twin.productSnapshot }
    : catalogProduct;
  return {
    twin,
    product,
    documents: data.documents.filter((record) => record.twinId === twin.id),
    events: data.events.filter((record) => record.twinId === twin.id),
  };
}
