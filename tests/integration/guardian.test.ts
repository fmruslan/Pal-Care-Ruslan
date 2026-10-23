// Dedicated PostgreSQL + injected gateway ONLY. No actual Sandbox calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, afterEach, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import { GuardianService } from "../../src/lib/price-guardian/service";
import {
  OperatorService,
  digestToken,
  type OperatorAction,
} from "../../src/lib/operator/service";
import { CheckoutService } from "../../src/lib/commerce/service";
import { RefundService } from "../../src/lib/commerce/refund-service";
import {
  guardianPolicyHash,
  guardianPolicy,
  GUARDIAN_PRODUCT,
  offerHash,
} from "../../src/lib/price-guardian/policy";
import { readGuardian } from "../../src/lib/price-guardian/projections";
import {
  inspectCapturedPayment,
  inspectPaymentLifecycle,
} from "../../src/lib/commerce/verification";
import type {
  RefundScope,
  RefundGateway,
} from "../../src/lib/commerce/refund-contracts";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import { sessionHash, newSessionToken } from "../../src/lib/commerce/security";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "Guardian tests require explicit local dedicated TEST_DATABASE_URL ending _test.",
  );
const { pool, db } = createDatabase(url);
const service = new GuardianService(pool),
  operators = new OperatorService(pool);
const owners: string[] = [];
class RefundDouble extends FakePayPal implements RefundGateway {
  capturedAt = "";
  calls: { captureId: string; key: string; minor: number }[] = [];
  refunds = new Map<string, Record<string, unknown>>();
  resourceStatus = "COMPLETED";
  loseResponse = false;
  hideRefunds = false;
  wrongParent = false;
  failGet = false;
  gate: Promise<void> | null = null;
  async capture(id: string, key: string) {
    await super.capture(id, key);
    this.capturedAt = new Date().toISOString();
  }
  async retrieve(id: string) {
    const p = await super.retrieve(id);
    if (p.purchaseUnits[0].payments.captures[0]) {
      p.purchaseUnits[0].payments.captures[0].createTime = this.capturedAt;
      if ([...this.refunds.values()].some((r) => r.status === "COMPLETED"))
        p.purchaseUnits[0].payments.captures[0].status = "PARTIALLY_REFUNDED";
    }
    return {
      ...p,
      purchaseUnits: [
        {
          ...p.purchaseUnits[0],
          payments: {
            ...p.purchaseUnits[0].payments,
            ...(this.hideRefunds
              ? {}
              : { refunds: [...this.refunds.values()] }),
          },
        },
      ],
    };
  }
  async retrieveCapture(id: string) {
    const p = await super.retrieveCapture(id);
    return {
      ...p,
      createTime: this.capturedAt,
      status: [...this.refunds.values()].some((r) => r.status === "COMPLETED")
        ? "PARTIALLY_REFUNDED"
        : p.status,
    };
  }
  async refund(captureId: string, key: string, minor: number) {
    this.calls.push({ captureId, key, minor });
    if (this.gate) await this.gate;
    const id = `R${randomUUID().replaceAll("-", "").toUpperCase()}`;
    const result = {
      id,
      status: this.resourceStatus,
      amount: { currencyCode: "USD", value: (minor / 100).toFixed(2) },
      customId: key,
      invoiceId: `PG-${key}`,
      createTime: new Date().toISOString(),
      links: [
        {
          rel: "up",
          method: "GET",
          href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${this.wrongParent ? "WRONGCAPTURE123" : captureId}`,
        },
      ],
    };
    this.refunds.set(id, result);
    if (this.loseResponse) throw new Error("Injected response loss");
    return result;
  }
  async retrieveRefund(id: string) {
    if (this.failGet) throw new Error("Injected read failure");
    return this.refunds.get(id);
  }
}
let gateway: RefundDouble;
async function grant(actions: OperatorAction[], caseId: string | null = null) {
  const g = await operators.issue({ actions, caseId, hours: 1 });
  const token = await operators.activate(g.code);
  return { ...g, session: digestToken(token) };
}
async function covered() {
  const catalog = await grant(["policy:publish", "price:publish"]);
  await service.publishPolicy(catalog.session);
  const owner = sessionHash(newSessionToken());
  owners.push(owner);
  const checkout = new CheckoutService(db, gateway, {
    ...testConfig,
    guardianPolicyEnabled: true,
  });
  const order = await checkout.start(
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
  const completed = await checkout.capture(order.id, owner);
  assert.equal(completed.state, "completed");
  await service.publishPrice(catalog.session, randomUUID(), "drop");
  await service.detect();
  const item = (await readGuardian(pool)).cases.find(
    (c) => c.twinId === completed.twinId,
  );
  assert.ok(item, "Expected a proactively detected covered opportunity");
  const operator = await grant(
    ["case:approve", "refund:execute", "refund:reconcile"],
    item.id,
  );
  return { catalog, checkout, owner, order, item, operator };
}
function scope(
  item: { id: string },
  captureId: string,
  enabled = true,
): RefundScope {
  return {
    enabled,
    readsEnabled: true,
    caseId: item.id,
    captureId,
    experimentId: "guardian-test",
    merchantId: testConfig.merchantId,
  };
}
async function prepared() {
  const c = await covered();
  await service.approve(
    c.operator.session,
    c.item.id,
    c.item.revision,
    randomUUID(),
  );
  const capture = (
    await pool.query("select capture_id from guardian_cases where id=$1", [
      c.item.id,
    ])
  ).rows[0].capture_id as string;
  return {
    ...c,
    capture,
    refund: new RefundService(db, pool, gateway, scope(c.item, capture)),
  };
}
async function cleanup() {
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
  if (owners.length) {
    await pool.query(
      "delete from care_events where twin_id in(select t.id from purchase_twins t join checkout_orders o on o.id=t.checkout_order_id where o.session_hash=any($1::text[]))",
      [owners],
    );
    await pool.query(
      "delete from documents where twin_id in(select t.id from purchase_twins t join checkout_orders o on o.id=t.checkout_order_id where o.session_hash=any($1::text[]))",
      [owners],
    );
    await pool.query(
      "delete from purchase_twins where checkout_order_id in(select id from checkout_orders where session_hash=any($1::text[]))",
      [owners],
    );
    await pool.query(
      "delete from checkout_orders where session_hash=any($1::text[])",
      [owners],
    );
  }
  owners.length = 0;
  await pool.query("delete from checkout_rate_limits");
  await pool.query("update products set price_minor=12900 where id=$1", [
    GUARDIAN_PRODUCT,
  ]);
  await seedDemo(db);
}
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
});
beforeEach(async () => {
  await cleanup();
  gateway = new RefundDouble();
});
afterEach(async () => {
  await cleanup();
});
after(async () => {
  await pool.end();
});

test("v2 checkout snapshot + automatic detection produces one USD 20 opportunity, not a refund", async () => {
  const c = await covered();
  assert.equal(c.item.amountMinor, 2000);
  assert.equal(c.item.state, "awaiting_approval");
  const saved = (
    await pool.query("select policy from checkout_orders where id=$1", [
      c.order.id,
    ])
  ).rows[0];
  assert.deepEqual(saved.policy, guardianPolicy);
  await Promise.all([service.detect(), service.detect()]);
  assert.equal((await readGuardian(pool)).cases.length, 1);
  assert.equal(gateway.calls.length, 0);
  assert.equal((await readGuardian(pool)).analytics.proposedMinor, 2000);
});
test("legacy purchase and pending checkout are not retroactively bound or adjusted", async () => {
  const owner = sessionHash(newSessionToken());
  owners.push(owner);
  const legacy = new CheckoutService(db, gateway, testConfig),
    order = await legacy.start(
      { productId: GUARDIAN_PRODUCT, requestId: randomUUID() },
      owner,
    );
  await legacy.capture(order.id, owner);
  const before = (
    await pool.query(
      "select to_jsonb(o) as row from checkout_orders o where id=$1",
      [order.id],
    )
  ).rows[0];
  const admin = await grant(["policy:publish", "price:publish"]);
  await service.publishPolicy(admin.session);
  await service.publishPrice(admin.session, randomUUID(), "drop");
  await service.detect();
  assert.equal((await readGuardian(pool)).cases.length, 0);
  assert.deepEqual(
    (
      await pool.query(
        "select to_jsonb(o) as row from checkout_orders o where id=$1",
        [order.id],
      )
    ).rows[0],
    before,
  );
});
test("old create retries retain original terms after v2 activation; stale/missing offer hash creates nothing", async () => {
  const owner = sessionHash(newSessionToken());
  owners.push(owner);
  const key = randomUUID();
  const legacy = new CheckoutService(db, gateway, testConfig);
  const first = await legacy.start(
    { productId: GUARDIAN_PRODUCT, requestId: key },
    owner,
  );
  const admin = await grant(["policy:publish"]);
  await service.publishPolicy(admin.session);
  const current = new CheckoutService(db, gateway, {
    ...testConfig,
    guardianPolicyEnabled: true,
  });
  assert.equal(
    (
      await current.start(
        { productId: GUARDIAN_PRODUCT, requestId: key },
        owner,
      )
    ).id,
    first.id,
  );
  await assert.rejects(
    current.start(
      { productId: GUARDIAN_PRODUCT, requestId: randomUUID() },
      owner,
    ),
    { code: "guardian_offer_changed" },
  );
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(
    (await pool.query("select count(*)::int n from guardian_bindings")).rows[0]
      .n,
    0,
  );
});
test("policy, binding and historical financial evidence cannot be silently rewritten", async () => {
  const c = await covered();
  await assert.rejects(
    pool.query("update guardian_policies set terms='changed'"),
    { code: "23514" },
  );
  await assert.rejects(
    pool.query("update guardian_bindings set policy_hash='changed'"),
    { code: "23514" },
  );
  await assert.rejects(
    pool.query("update guardian_cases set capture_id='OTHER' where id=$1", [
      c.item.id,
    ]),
    { code: "23514" },
  );
});
test("one-time operator grants reject reactivation, wrong case, revocation and expired access", async () => {
  const c = await covered();
  await assert.rejects(operators.activate(c.operator.code), { status: 403 });
  await assert.rejects(
    service.approve(c.catalog.session, c.item.id, 1, randomUUID()),
    { status: 403 },
  );
  await operators.revoke(c.operator.id);
  await assert.rejects(
    service.approve(c.operator.session, c.item.id, 1, randomUUID()),
    { status: 403 },
  );
  const next = await grant(["case:approve"], c.item.id);
  await pool.query(
    "update operator_sessions set expires_at=now()-interval '1 second' where grant_id=$1",
    [next.id],
  );
  await assert.rejects(
    service.approve(next.session, c.item.id, 1, randomUUID()),
    { status: 403 },
  );
});
test("approval replay is idempotent; changed price invalidates the old revision", async () => {
  const c = await covered(),
    key = randomUUID();
  const approval = await service.approve(c.operator.session, c.item.id, 1, key);
  assert.deepEqual(
    await service.approve(c.operator.session, c.item.id, 1, key),
    approval,
  );
  await service.publishPrice(c.catalog.session, randomUUID(), "restore");
  await service.detect();
  await assert.rejects(
    service.approve(c.operator.session, c.item.id, 1, randomUUID()),
    { code: "guardian_approval_stale" },
  );
  assert.equal((await readGuardian(pool)).analytics.proposedMinor, 0);
});
test("completed independent refund updates the Twin ledger once and never rewrites its receipt", async () => {
  const c = await prepared();
  const receipt = (
    await pool.query(
      "select content from documents where twin_id=$1 and kind='receipt'",
      [c.item.twinId],
    )
  ).rows;
  await c.refund.execute(c.operator.session, c.item.id, 1);
  const result = await readGuardian(pool);
  assert.equal(result.cases[0].state, "completed");
  assert.equal(result.analytics.verifiedMinor, 2000);
  assert.equal(result.analytics.verifiedCount, 1);
  assert.equal(result.analytics.proposedMinor, 0);
  await c.refund.execute(c.operator.session, c.item.id, 1);
  await c.refund.reconcile(c.operator.session, c.item.id);
  assert.equal(gateway.calls.length, 1);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from guardian_events where kind='refund.completed'",
      )
    ).rows[0].n,
    1,
  );
  assert.deepEqual(
    (
      await pool.query(
        "select content from documents where twin_id=$1 and kind='receipt'",
        [c.item.twinId],
      )
    ).rows,
    receipt,
  );
  const op = (await pool.query("select * from guardian_refunds")).rows[0];
  await assert.rejects(
    pool.query("update guardian_refunds set request_key=$1 where id=$2", [
      randomUUID(),
      op.id,
    ]),
    { code: "23514" },
  );
});
test("pending is counted separately; later completion is retrieved, never resubmitted", async () => {
  gateway.resourceStatus = "PENDING";
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  let view = await readGuardian(pool);
  assert.equal(view.analytics.pendingMinor, 2000);
  assert.equal(view.analytics.verifiedMinor, 0);
  for (const r of gateway.refunds.values()) r.status = "COMPLETED";
  await c.refund.reconcile(c.operator.session, c.item.id);
  view = await readGuardian(pool);
  assert.equal(view.analytics.verifiedMinor, 2000);
  assert.equal(view.analytics.pendingMinor, 0);
  assert.equal(gateway.calls.length, 1);
});
for (const status of ["FAILED", "CANCELLED"])
  test(`provider ${status} remains terminal with no verified savings`, async () => {
    gateway.resourceStatus = status;
    const c = await prepared();
    await c.refund.execute(c.operator.session, c.item.id, 1);
    assert.equal((await readGuardian(pool)).analytics.verifiedMinor, 0);
    assert.equal((await readGuardian(pool)).analytics.failedCount, 1);
    await c.refund.execute(c.operator.session, c.item.id, 1);
    assert.equal(gateway.calls.length, 1);
  });
test("lost refund ID is recovered only from a uniquely correlated collection plus independent GET", async () => {
  gateway.loseResponse = true;
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  const before = (await pool.query("select * from guardian_refunds")).rows[0];
  assert.equal(before.refund_id, null);
  assert.equal(before.state, "unknown");
  await c.refund.reconcile(c.operator.session, c.item.id);
  const after = (await pool.query("select * from guardian_refunds")).rows[0];
  assert.equal(after.state, "completed");
  assert.equal(after.request_key, before.request_key);
  assert.equal(gateway.calls.length, 1);
});
test("absent optional refund collection keeps unknown operations blocked and reserved", async () => {
  gateway.loseResponse = true;
  gateway.hideRefunds = true;
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  await c.refund.reconcile(c.operator.session, c.item.id);
  const op = (await pool.query("select * from guardian_refunds")).rows[0];
  assert.equal(op.state, "unknown");
  assert.equal(op.recovery_observation, "refund_collection_absent");
  assert.equal((await readGuardian(pool)).analytics.unresolvedMinor, 2000);
  assert.equal((await readGuardian(pool)).analytics.verifiedMinor, 0);
  await c.refund.execute(c.operator.session, c.item.id, 1);
  assert.equal(gateway.calls.length, 1);
});
test("wrong parent and read failures cannot establish completion or trigger another refund", async () => {
  gateway.wrongParent = true;
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  assert.equal((await readGuardian(pool)).analytics.verifiedMinor, 0);
  await assert.rejects(c.refund.reconcile(c.operator.session, c.item.id));
  assert.equal(gateway.calls.length, 1);
});
test("execution-off gate precedes provider reads and all monetary effects", async () => {
  const c = await prepared();
  const prior = gateway.retrieveCalls.length;
  const disabled = new RefundService(
    db,
    pool,
    gateway,
    scope(c.item, c.capture, false),
  );
  await assert.rejects(disabled.execute(c.operator.session, c.item.id, 1), {
    code: "guardian_refunds_disabled",
  });
  assert.equal(gateway.retrieveCalls.length, prior);
  assert.equal(gateway.calls.length, 0);
});
test("simultaneous dispatch attempts acquire a single capture reservation and idempotency key", async () => {
  const c = await prepared();
  await Promise.allSettled([
    c.refund.execute(c.operator.session, c.item.id, 1),
    c.refund.execute(c.operator.session, c.item.id, 1),
  ]);
  assert.equal(gateway.calls.length, 1);
  assert.equal(
    (await pool.query("select count(*)::int n from guardian_refunds")).rows[0]
      .n,
    1,
  );
  assert.equal((await readGuardian(pool)).analytics.verifiedCount, 1);
});
test("aftercare accepts refunded capture lifecycle but original first-capture verifier stays strict", async () => {
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  const order = (
    await db.select().from((await import("../../src/db/schema")).checkoutOrders)
  ).find((o) => o.id === c.order.id)!;
  const p = await gateway.retrieve(order.providerOrderId!),
    capture = await gateway.retrieveCapture(order.providerCaptureId!);
  assert.equal(
    inspectPaymentLifecycle(p, capture, order).captureStatus,
    "PARTIALLY_REFUNDED",
  );
  assert.throws(() =>
    inspectCapturedPayment(capture, order, {
      id: order.providerCaptureId!,
      capturedAt: order.capturedAt!,
    }),
  );
});

test("actual runtime rejects an unrestricted evidence writer before any provider read", async () => {
  const c = await prepared(),
    reads = gateway.retrieveCalls.length;
  const restricted = new RefundService(db, pool, gateway, {
    ...scope(c.item, c.capture),
    restrictedWriter: true,
  });
  await assert.rejects(restricted.execute(c.operator.session, c.item.id, 1), {
    code: "guardian_writer_not_restricted",
  });
  assert.equal(gateway.retrieveCalls.length, reads);
  assert.equal(gateway.calls.length, 0);
});

for (const kind of ["missing", "ambiguous"])
  test(`unknown refund correlation ${kind} remains reserved without POST replay`, async () => {
    gateway.loseResponse = true;
    const c = await prepared();
    await c.refund.execute(c.operator.session, c.item.id, 1);
    const original = [...gateway.refunds.values()][0];
    if (kind === "missing") {
      delete original.customId;
      delete original.invoiceId;
    } else
      gateway.refunds.set("DUPLICATEREFUND1", {
        ...original,
        id: "DUPLICATEREFUND1",
      });
    await c.refund.reconcile(c.operator.session, c.item.id);
    const op = (await pool.query("select * from guardian_refunds")).rows[0];
    assert.equal(op.state, "unknown");
    assert.equal(op.refund_id, null);
    assert.equal(
      op.recovery_observation,
      kind === "missing"
        ? "refund_correlation_absent"
        : "refund_collection_ambiguous",
    );
    await c.refund.execute(c.operator.session, c.item.id, 1);
    assert.equal(gateway.calls.length, 1);
  });

test("stale approval and a concurrently restored price block first dispatch", async () => {
  const c = await prepared();
  await service.publishPrice(c.catalog.session, randomUUID(), "restore");
  await assert.rejects(c.refund.execute(c.operator.session, c.item.id, 1), {
    code: "guardian_approval_stale",
  });
  assert.equal(gateway.calls.length, 0);
  assert.equal(
    (await pool.query("select count(*)::int n from guardian_refunds")).rows[0]
      .n,
    0,
  );
});

test("observed external pending refund blocks initial submission", async () => {
  const c = await prepared();
  gateway.refunds.set("EXTERNALREFUND1", {
    id: "EXTERNALREFUND1",
    status: "PENDING",
  });
  await assert.rejects(c.refund.execute(c.operator.session, c.item.id, 1), {
    code: "guardian_prior_refund_or_uncertain_balance",
  });
  assert.equal(gateway.calls.length, 0);
});

test("expired merchant approval blocks dispatch without releasing a financial reservation", async () => {
  const c = await prepared();
  // Test DB only: replace the unused immutable approval with an expired one.
  await pool.query("delete from guardian_approvals where case_id=$1", [
    c.item.id,
  ]);
  await pool.query(
    "insert into guardian_approvals(id,request_id,case_id,revision,amount_minor,policy_hash,price_event_id,actor,expires_at) select gen_random_uuid(),gen_random_uuid(),id,revision,amount_minor,policy_hash,price_event_id,$2,now()-interval '1 second' from guardian_cases where id=$1",
    [c.item.id, c.operator.id],
  );
  await assert.rejects(c.refund.execute(c.operator.session, c.item.id, 1), {
    code: "guardian_approval_stale",
  });
  assert.equal(gateway.calls.length, 0);
  const overview = await readGuardian(pool);
  assert.equal(overview.analytics.approvedMinor, 0);
  assert.equal(overview.analytics.proposedMinor, 2000);
  assert.equal(overview.cases[0].state, "awaiting_approval");
});

test("known refund ID survives independent retrieval failure and later resolves without resubmission", async () => {
  const c = await prepared();
  gateway.failGet = true;
  await c.refund.execute(c.operator.session, c.item.id, 1);
  const saved = (await pool.query("select * from guardian_refunds")).rows[0];
  assert.ok(saved.refund_id);
  assert.equal(saved.state, "unknown");
  gateway.failGet = false;
  await c.refund.reconcile(c.operator.session, c.item.id);
  const view = await readGuardian(pool);
  assert.equal(view.analytics.verifiedMinor, 2000);
  assert.equal(view.analytics.unresolvedMinor, 0);
  assert.ok(view.cases[0].approvedAt);
  assert.ok(view.cases[0].attemptedAt);
  assert.ok(view.cases[0].checkedAt);
  assert.equal(view.cases[0].refundId, saved.refund_id);
  assert.equal(gateway.calls.length, 1);
});

test("a pending refund reconciles beyond the first-dispatch policy deadline without another POST", async (t) => {
  gateway.resourceStatus = "PENDING";
  const c = await prepared();
  await c.refund.execute(c.operator.session, c.item.id, 1);
  for (const r of gateway.refunds.values()) r.status = "COMPLETED";
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 15 * 86400000);
  await c.refund.reconcile(c.operator.session, c.item.id);
  assert.equal((await readGuardian(pool)).analytics.verifiedMinor, 2000);
  assert.equal(gateway.calls.length, 1);
  t.mock.restoreAll();
});

test("completed refund with inconsistent capture lifecycle stays in review, not verified analytics", async () => {
  const c = await prepared();
  const retrieve = gateway.retrieve.bind(gateway),
    retrieveCapture = gateway.retrieveCapture.bind(gateway);
  gateway.retrieve = async (id) => {
    const payload = await retrieve(id);
    payload.purchaseUnits[0].payments.captures[0].status = "COMPLETED";
    return payload;
  };
  gateway.retrieveCapture = async (id) => ({
    ...(await retrieveCapture(id)),
    status: "COMPLETED",
  });
  await c.refund.execute(c.operator.session, c.item.id, 1);
  const overview = await readGuardian(pool);
  assert.equal(overview.cases[0].state, "review");
  assert.equal(overview.analytics.verifiedMinor, 0);
  assert.equal(overview.analytics.unresolvedMinor, 2000);
  await c.refund.execute(c.operator.session, c.item.id, 1);
  assert.equal(gateway.calls.length, 1);
});
