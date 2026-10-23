// Synthetic evidence for the exclusive browser suite's DEDICATED test DB only.
import { randomUUID } from "node:crypto";
import { createDatabase } from "../../src/db/connection";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { seedDemo } from "../../src/db/seed";
import { CheckoutService } from "../../src/lib/commerce/service";
import { GuardianService } from "../../src/lib/price-guardian/service";
import { OperatorService, digestToken } from "../../src/lib/operator/service";
import {
  GUARDIAN_PRODUCT,
  guardianPolicyHash,
  offerHash,
} from "../../src/lib/price-guardian/policy";
import { sessionHash, newSessionToken } from "../../src/lib/commerce/security";
import { FakePayPal, testConfig } from "./paypal-fixture";
import { RefundService } from "../../src/lib/commerce/refund-service";

class BrowserRefundDouble extends FakePayPal {
  time = "";
  refunded = false;
  calls = 0;
  resource: unknown = null;
  async capture(id: string, key: string) {
    await super.capture(id, key);
    this.time = new Date().toISOString();
  }
  async retrieve(id: string) {
    const p = await super.retrieve(id);
    const c = p.purchaseUnits[0].payments.captures[0];
    if (c) {
      c.createTime = this.time;
      if (this.refunded) c.status = "PARTIALLY_REFUNDED";
    }
    return p;
  }
  async retrieveCapture(id: string) {
    return {
      ...(await super.retrieveCapture(id)),
      createTime: this.time,
      status: this.refunded ? "PARTIALLY_REFUNDED" : "COMPLETED",
    };
  }
  async refund(capture: string, key: string, minor: number) {
    this.calls++;
    this.refunded = true;
    this.resource = {
      id: `R${randomUUID().replaceAll("-", "").toUpperCase()}`,
      status: "COMPLETED",
      amount: { currencyCode: "USD", value: (minor / 100).toFixed(2) },
      createTime: new Date().toISOString(),
      customId: key,
      invoiceId: `PG-${key}`,
      links: [
        {
          rel: "up",
          href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${capture}`,
        },
      ],
    };
    return this.resource;
  }
  async retrieveRefund() {
    return this.resource;
  }
}
export async function guardianBrowserFixture() {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    !URL.canParse(url) ||
    !new URL(url).pathname.endsWith("_test") ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Exclusive Guardian browser tests require a dedicated local TEST_DATABASE_URL.",
    );
  const { db, pool } = createDatabase(url);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
  const operator = new OperatorService(pool),
    guardian = new GuardianService(pool),
    gateway = new BrowserRefundDouble();
  const publisher = await operator.issue({
    actions: ["policy:publish", "price:publish"],
    caseId: null,
    hours: 1,
  });
  const publisherToken = await operator.activate(publisher.code);
  await guardian.publishPolicy(digestToken(publisherToken));
  const owner = sessionHash(newSessionToken());
  await pool.query("delete from checkout_rate_limits");
  const checkout = new CheckoutService(db, gateway, {
    ...testConfig,
    guardianPolicyEnabled: true,
  });
  const created = await checkout.start(
    {
      productId: GUARDIAN_PRODUCT,
      requestId: randomUUID(),
      offerHash: offerHash(
        { id: GUARDIAN_PRODUCT, priceMinor: 12900, currency: "USD" },
        guardianPolicyHash,
      ),
    },
    owner,
  );
  const completed = await checkout.capture(created.id, owner);
  await guardian.publishPrice(
    digestToken(publisherToken),
    randomUUID(),
    "drop",
  );
  await guardian.detect();
  const item = (
    await pool.query("select * from guardian_cases where twin_id=$1", [
      completed.twinId,
    ])
  ).rows[0];
  if (!item)
    throw new Error(
      "Synthetic Guardian browser fixture failed to create a case.",
    );
  const grant = await operator.issue({
    actions: ["case:approve", "refund:execute", "refund:reconcile"],
    caseId: item.id,
    hours: 1,
  });
  return {
    caseId: item.id as string,
    twinId: completed.twinId!,
    code: grant.code,
    completeWithDouble: async () => {
      const s = (
        await pool.query(
          "select hash from operator_sessions where grant_id=$1",
          [grant.id],
        )
      ).rows[0];
      await new RefundService(db, pool, gateway, {
        enabled: true,
        readsEnabled: true,
        caseId: item.id,
        captureId: item.capture_id,
        experimentId: "browser-test-only",
        merchantId: testConfig.merchantId,
      }).execute(s.hash, item.id, 1);
      if (gateway.calls !== 1)
        throw new Error("Expected one injected refund, never a provider call.");
    },
    cleanup: async () => {
      for (const table of [
        "guardian_events",
        "guardian_refunds",
        "guardian_approvals",
        "guardian_cases",
        "guardian_bindings",
        "guardian_prices",
        "guardian_policies",
        "operator_sessions",
        "operator_grants",
        "guardian_counters",
        "guardian_checks",
      ])
        await pool.query(`delete from ${table}`);
      await pool.query("delete from care_events where twin_id=$1", [
        completed.twinId,
      ]);
      await pool.query("delete from documents where twin_id=$1", [
        completed.twinId,
      ]);
      await pool.query("delete from purchase_twins where id=$1", [
        completed.twinId,
      ]);
      await pool.query("delete from checkout_orders where id=$1", [created.id]);
      await pool.query("update products set price_minor=12900 where id=$1", [
        GUARDIAN_PRODUCT,
      ]);
      await pool.query("delete from checkout_rate_limits");
      await seedDemo(db);
      await pool.end();
    },
  };
}
