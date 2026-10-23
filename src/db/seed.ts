import type { createDatabase } from "./connection";
import {
  customers,
  merchants,
  products,
  purchaseTwins,
  documents,
  careEvents,
} from "./schema";
import { demoData } from "../lib/demo/fixtures";
import { careKnowledge } from "./careos-schema";
import { referenceSource } from "../lib/careos/knowledge";

export async function seedDemo(db: ReturnType<typeof createDatabase>["db"]) {
  await db.transaction(async (tx) => {
    // Deterministic IDs; repeat deployments do not erase or overwrite existing records.
    await tx.insert(customers).values(demoData.customer).onConflictDoNothing();
    await tx.insert(merchants).values(demoData.merchant).onConflictDoNothing();
    await tx.insert(products).values(demoData.products).onConflictDoNothing();
    await tx.insert(purchaseTwins).values(demoData.twins).onConflictDoNothing();
    await tx.insert(documents).values(demoData.documents).onConflictDoNothing();
    await tx.insert(careEvents).values(demoData.events).onConflictDoNothing();
    await tx
      .insert(careKnowledge)
      .values(referenceSource)
      .onConflictDoNothing();
  });
}
