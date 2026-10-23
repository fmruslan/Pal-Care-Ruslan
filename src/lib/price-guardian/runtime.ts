import "server-only";
import { connection } from "next/server";
import { createDatabase } from "../../db/connection";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../../db/authority";
import { getEnvironment } from "../config";
import { GuardianError } from "./contracts";
import { GuardianService } from "./service";
import { OperatorService } from "../operator/service";
import { validOperatorOrigin } from "../operator/origin";
import { emptyOverview, readGuardian } from "./projections";
import { refundScope } from "../commerce/refund-contracts";
import { RefundService } from "../commerce/refund-service";
import { SandboxPayPal } from "../commerce/paypal";
import {
  GUARDIAN_POLICY_ID,
  guardianPolicyHash,
  guardianTerms,
  offerHash,
  validatePolicy,
} from "./policy";

const state = globalThis as unknown as {
  guardianDatabase?: ReturnType<typeof createDatabase>;
  guardianReadDatabase?: ReturnType<typeof createDatabase>;
};
export async function guardianRuntime() {
  const config = getEnvironment();
  const origin = process.env.APP_ORIGIN;
  if (
    config.dataSource !== "database" ||
    process.env.GUARDIAN_OPERATIONS_ENABLED !== "true" ||
    !validOperatorOrigin(origin)
  )
    throw new GuardianError("guardian_operations_disabled", 503);
  const database = (state.guardianDatabase ??= createDatabase(
    runtimeWriterUrl("GUARDIAN_DATABASE_URL"),
  ));
  runtimeWriterUrl("GUARDIAN_DATABASE_URL");
  await assertDatabaseAuthority(database.pool, "guardian");
  return {
    ...database,
    origin,
    guardian: new GuardianService(database.pool),
    operator: new OperatorService(database.pool),
  };
}
export async function refundRuntime() {
  const scope = refundScope(process.env);
  if (!scope.readsEnabled)
    throw new GuardianError("guardian_provider_scope_disabled", 503);
  const runtime = await guardianRuntime();
  return new RefundService(
    runtime.db,
    runtime.pool,
    new SandboxPayPal({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    }),
    scope,
  );
}
export async function getGuardian() {
  await connection();
  const config = getEnvironment();
  if (config.dataSource === "fixtures") return emptyOverview();
  const database = (state.guardianReadDatabase ??= createDatabase(
    config.databaseUrl!,
    { readOnly: true },
  ));
  try {
    await assertDatabaseAuthority(database.pool, "reader");
    return await readGuardian(
      database.pool,
      process.env.GUARDIAN_SCHEDULED_MONITORING_ENABLED === "true",
    );
  } catch {
    throw new Error(
      "Price Guardian records are unavailable. Check the reviewed migrations; no fixture fallback was substituted.",
    );
  }
}
export async function displayedPromise(product: {
  id: string;
  priceMinor: number;
  currency: string;
}) {
  await connection();
  if (process.env.PRICE_GUARDIAN_CHECKOUT_ENABLED !== "true") return null;
  const config = getEnvironment();
  if (config.dataSource !== "database") return null;
  const database = (state.guardianReadDatabase ??= createDatabase(
    config.databaseUrl!,
    { readOnly: true },
  ));
  const policy = (
    await database.pool.query(
      "select * from guardian_policies where id=$1 and product_id=$2 and approved_at is not null",
      [GUARDIAN_POLICY_ID, product.id],
    )
  ).rows[0];
  if (!policy || !validatePolicy(policy.rules, policy.terms, policy.hash))
    return null;
  return {
    offerHash: offerHash(product, guardianPolicyHash),
    terms: guardianTerms,
  };
}
