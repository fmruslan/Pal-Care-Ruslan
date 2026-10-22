import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/connection";
import { checkoutOrders, purchaseTwins, documents } from "../src/db/schema";
import { parseCheckoutConfig } from "../src/lib/commerce/config";
import { SandboxPayPal } from "../src/lib/commerce/paypal";
import {
  inspectCapturedPayment,
  inspectOrder,
} from "../src/lib/commerce/verification";
import { recordIdSchema } from "../src/lib/demo/presentation";
import "./environment";

async function main() {
  const config = parseCheckoutConfig(process.env);
  if (!config.enabled) {
    console.error(
      "BLOCKED: Configure the PayPal Sandbox app credentials, merchant ID, APP_ORIGIN, database mode and explicit enablement. No provider call was made.",
    );
    process.exitCode = 2;
    return;
  }
  const id = process.argv[2];
  if (!recordIdSchema.safeParse(id).success)
    throw new Error(
      "Supply the local checkout UUID after an actual sandbox purchase.",
    );
  const { db, pool } = createDatabase(config.databaseUrl, { readOnly: true });
  try {
    const [order] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, id));
    assert.ok(
      order?.providerOrderId,
      "Local order must have a PayPal reference.",
    );
    const gateway = new SandboxPayPal(config);
    const evidence = inspectOrder(
      await gateway.retrieve(order.providerOrderId),
      order,
    );
    assert.ok(
      evidence.capture,
      "PayPal must return a matching completed capture.",
    );
    inspectCapturedPayment(
      await gateway.retrieveCapture(evidence.capture.id),
      order,
      evidence.capture,
    );
    const [twin] = await db
      .select()
      .from(purchaseTwins)
      .where(eq(purchaseTwins.checkoutOrderId, id));
    assert.ok(
      twin &&
        twin.origin === "sandbox" &&
        twin.paypalCaptureId === evidence.capture.id &&
        twin.verifiedAt &&
        twin.productSnapshot,
      "A matching durable Purchase Twin must exist.",
    );
    const receipt = await db
      .select()
      .from(documents)
      .where(eq(documents.twinId, twin.id));
    assert.ok(
      receipt.some((doc) => doc.origin === "sandbox" && doc.kind === "receipt"),
    );
    console.log(
      JSON.stringify(
        {
          verification: "actual-paypal-sandbox",
          localCheckoutId: id,
          purchaseTwinId: twin.id,
          captureStatus: "COMPLETED",
          receiptStored: true,
          webhookVerification: "not-implemented",
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "NOT VERIFIED: PayPal evidence and the durable Purchase Twin did not both validate. Inspect the checkout via the operator environment; no credentials or payer data were logged.",
  );
  process.exitCode = 1;
});
