import { createDatabase } from "../src/db/connection";
import { GuardianService } from "../src/lib/price-guardian/service";
import { RefundService } from "../src/lib/commerce/refund-service";
import { refundScope } from "../src/lib/commerce/refund-contracts";
import { SandboxPayPal } from "../src/lib/commerce/paypal";
import { databaseUrl } from "./environment";

const { db, pool } = createDatabase(
  process.env.GUARDIAN_DATABASE_URL || databaseUrl(),
);
try {
  const detected = await new GuardianService(pool).detect();
  const scope = refundScope(process.env);
  if (scope.readsEnabled && scope.caseId) {
    const operation = await pool.query(
      "select case_id from guardian_refunds where case_id=$1 and state in ('submitting','unknown','pending','review')",
      [scope.caseId],
    );
    if (operation.rowCount)
      await new RefundService(
        db,
        pool,
        new SandboxPayPal({
          clientId: process.env.PAYPAL_CLIENT_ID!,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
        }),
        scope,
      ).reconcile(null, scope.caseId);
  }
  console.log(
    `Guardian catalog check complete: ${detected.scanned} policy-bound purchases scanned. Job never dispatches refunds.`,
  );
} catch {
  console.error(
    "Guardian job failed; state remains durable for a bounded retry. No automatic refund POST is permitted.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
