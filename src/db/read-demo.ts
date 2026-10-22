import { eq, inArray, sql } from "drizzle-orm";
import type { createDatabase } from "./connection";
import {
  customers,
  merchants,
  products,
  purchaseTwins,
  documents,
  careEvents,
  type DemoData,
} from "./schema";
import { CUSTOMER_ID, MERCHANT_ID } from "../lib/demo/fixtures";

export async function readDemoData(
  db: ReturnType<typeof createDatabase>["db"],
): Promise<DemoData> {
  return db.transaction(
    async (tx) => {
      // Public routes cannot mutate data, even if a future query is accidentally changed.
      await tx.execute(sql`set transaction read only`);
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, CUSTOMER_ID));
      const [merchant] = await tx
        .select()
        .from(merchants)
        .where(eq(merchants.id, MERCHANT_ID));
      if (!customer || !merchant)
        throw new Error("Demo seed is not installed.");
      const catalog = await tx
        .select()
        .from(products)
        .where(eq(products.merchantId, MERCHANT_ID))
        .orderBy(products.id);
      const twins = await tx
        .select()
        .from(purchaseTwins)
        .where(eq(purchaseTwins.customerId, CUSTOMER_ID))
        .orderBy(purchaseTwins.id);
      const twinIds = twins
        .filter((twin) => twin.merchantId === MERCHANT_ID)
        .map((twin) => twin.id);
      const docs = twinIds.length
        ? await tx
            .select()
            .from(documents)
            .where(inArray(documents.twinId, twinIds))
            .orderBy(documents.id)
        : [];
      const events = twinIds.length
        ? await tx
            .select()
            .from(careEvents)
            .where(inArray(careEvents.twinId, twinIds))
            .orderBy(careEvents.occurredOn)
        : [];
      return {
        customer,
        merchant,
        products: catalog,
        twins: twins.filter((twin) => twin.merchantId === MERCHANT_ID),
        documents: docs,
        events: events.reverse(),
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
