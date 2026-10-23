import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/connection";
import { checkoutOrders } from "../src/db/schema";
import { SandboxPayPal } from "../src/lib/commerce/paypal";
import { refundScope } from "../src/lib/commerce/refund-contracts";
import { inspectPaymentLifecycle } from "../src/lib/commerce/verification";
import {
  inspectRefund,
  discoverRefund,
} from "../src/lib/commerce/refund-verification";
import "./environment";

async function main() {
  const scope = refundScope(process.env);
  if (
    !scope.readsEnabled ||
    !scope.caseId ||
    scope.caseId !== process.argv[2]
  ) {
    console.error(
      "BLOCKED: explicit separately approved Guardian provider-read scope is required. No provider call made.",
    );
    process.exitCode = 2;
    return;
  }
  const { db, pool } = createDatabase(process.env.GUARDIAN_DATABASE_URL!, {
    readOnly: true,
  });
  try {
    const row = (
      await pool.query(
        "select r.*,t.checkout_order_id from guardian_refunds r join guardian_cases c on c.id=r.case_id join purchase_twins t on t.id=c.twin_id where r.case_id=$1 and r.capture_id=$2",
        [scope.caseId, scope.captureId],
      )
    ).rows[0];
    if (!row?.refund_id) throw new Error();
    const [order] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, row.checkout_order_id));
    if (
      !order ||
      order.expectedPayeeId !== scope.merchantId ||
      order.providerCaptureId !== scope.captureId
    )
      throw new Error();
    const provider = new SandboxPayPal({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    });
    const life = inspectPaymentLifecycle(
      await provider.retrieve(order.providerOrderId!),
      await provider.retrieveCapture(scope.captureId!),
      order,
    );
    const refund = inspectRefund(await provider.retrieveRefund(row.refund_id), {
      refundId: row.refund_id,
      captureId: row.capture_id,
      requestKey: row.request_key,
      amountMinor: row.amount_minor,
      attemptedAt: row.attempted_at,
      merchantId: order.expectedPayeeId,
    });
    const discovery = discoverRefund(life.refunds, row.request_key);
    console.log(
      JSON.stringify(
        {
          verification: "actual-paypal-sandbox-provider-reads",
          refundStatus: refund.status,
          amountMinor: row.amount_minor,
          captureStatus: life.captureStatus,
          ordersRefundCollectionPresent: life.refunds !== null,
          unknownIdCandidateMatchesPinnedRefund: discovery.id === row.refund_id,
          recoveryObservation: discovery.observation,
          mutations: 0,
        },
        null,
        2,
      ),
    );
    if (
      refund.status !== "COMPLETED" ||
      life.captureStatus !== "PARTIALLY_REFUNDED"
    )
      process.exitCode = 2;
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "NOT VERIFIED: Guardian scope or retrieved provider evidence did not validate. No provider mutation or local state promotion was performed.",
  );
  process.exitCode = 1;
});
