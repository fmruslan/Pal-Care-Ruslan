import { sql } from "drizzle-orm";
import type { createDatabase } from "../../db/connection";
import { CheckoutError } from "../commerce/contracts";
import {
  GUARDIAN_POLICY_ID,
  GUARDIAN_PRODUCT,
  guardianPolicy,
  guardianPolicyHash,
  offerHash,
  validatePolicy,
} from "./policy";
import type { ProductSnapshot } from "../commerce/contracts";

type Database = ReturnType<typeof createDatabase>["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function checkoutPromise(
  tx: Transaction,
  product: ProductSnapshot,
  enabled: boolean,
  presentedHash?: string,
) {
  if (!enabled || product.id !== GUARDIAN_PRODUCT) {
    if (presentedHash) throw new CheckoutError("guardian_offer_changed");
    return null;
  }
  const result = await tx.execute(
    sql`select * from guardian_policies where id=${GUARDIAN_POLICY_ID} and approved_at is not null and approved_at <= clock_timestamp() for share`,
  );
  const row = result.rows[0];
  if (!row || !validatePolicy(row.rules, String(row.terms), String(row.hash)))
    throw new CheckoutError("guardian_policy_unavailable");
  if (presentedHash !== offerHash(product, guardianPolicyHash))
    throw new CheckoutError("guardian_offer_changed");
  return guardianPolicy;
}
export async function bindPromise(tx: Transaction, orderId: string) {
  await tx.execute(
    sql`insert into guardian_bindings(checkout_order_id,policy_id,policy_hash,bound_at) values(${orderId},${GUARDIAN_POLICY_ID},${guardianPolicyHash},clock_timestamp())`,
  );
}
