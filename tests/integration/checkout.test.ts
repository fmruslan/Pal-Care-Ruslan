// Real PostgreSQL + injected test PayPal gateway. These tests are NOT sandbox evidence.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, inArray } from "drizzle-orm";
import { createDatabase } from "../../src/db/connection";
import {
  checkoutOrders,
  checkoutRateLimits,
  documents,
  purchaseTwins,
  careEvents,
  products,
} from "../../src/db/schema";
import { seedDemo } from "../../src/db/seed";
import { readDemoData } from "../../src/db/read-demo";
import { findTwin } from "../../src/lib/demo/presentation";
import { CheckoutService } from "../../src/lib/commerce/service";
import { newSessionToken, sessionHash } from "../../src/lib/commerce/security";
import { demoData } from "../../src/lib/demo/fixtures";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Checkout integration tests require a dedicated TEST_DATABASE_URL database ending in _test.",
  );
const { db, pool } = createDatabase(url);
let gateway: FakePayPal;
let service: CheckoutService;
const sessions: string[] = [];
function newSession() {
  const hash = sessionHash(newSessionToken());
  sessions.push(hash);
  return hash;
}
async function begin(hash = newSession(), requestId = randomUUID()) {
  return {
    hash,
    order: await service.start(
      { productId: demoData.products[0].id, requestId },
      hash,
    ),
    requestId,
  };
}
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
});
beforeEach(async () => {
  gateway = new FakePayPal();
  service = new CheckoutService(db, gateway, testConfig);
  await db.delete(checkoutRateLimits);
});
afterEach(async () => {
  const orders = await db
    .select()
    .from(checkoutOrders)
    .where(
      inArray(
        checkoutOrders.sessionHash,
        sessions.length ? sessions : ["none"],
      ),
    );
  const ids = orders.map((order) => order.id);
  if (ids.length) {
    const twins = await db
      .select()
      .from(purchaseTwins)
      .where(inArray(purchaseTwins.checkoutOrderId, ids));
    const twinIds = twins.map((twin) => twin.id);
    if (twinIds.length) {
      await db.delete(careEvents).where(inArray(careEvents.twinId, twinIds));
      await db.delete(documents).where(inArray(documents.twinId, twinIds));
      await db.delete(purchaseTwins).where(inArray(purchaseTwins.id, twinIds));
    }
    await db.delete(checkoutOrders).where(inArray(checkoutOrders.id, ids));
  }
  sessions.length = 0;
});
after(async () => {
  await pool.end();
});

test("completed retrieved capture atomically creates one snapshotted Twin, receipt, policy and event", async () => {
  const { hash, order } = await begin();
  const result = await service.capture(order.id, hash);
  assert.equal(result.state, "completed");
  assert.ok(result.twinId);
  const [twin] = await db
    .select()
    .from(purchaseTwins)
    .where(eq(purchaseTwins.id, result.twinId));
  assert.equal(twin.origin, "sandbox");
  assert.equal(twin.purchasePriceMinor, 12900);
  assert.ok(twin.paypalCaptureId);
  assert.equal(twin.productSnapshot?.name, demoData.products[0].name);
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.twinId, result.twinId));
  assert.equal(
    docs.filter((doc) => doc.origin === "sandbox" && doc.kind === "receipt")
      .length,
    1,
  );
  assert.equal(docs.filter((doc) => doc.kind === "policy").length, 1);
  assert.equal((await service.capture(order.id, hash)).twinId, result.twinId);
  assert.equal(gateway.captureCalls.length, 1);
});
test("duplicate create calls use one persisted provider idempotency key", async () => {
  const { hash, order, requestId } = await begin();
  assert.equal(
    (
      await service.start(
        { productId: demoData.products[0].id, requestId },
        hash,
      )
    ).id,
    order.id,
  );
  assert.equal(gateway.createCalls.length, 1);
  await assert.rejects(
    service.start({ productId: demoData.products[1].id, requestId }, hash),
    { message: "idempotency_conflict" },
  );
});
test("an ambiguous create is retried with the original payload and request key", async () => {
  gateway.failCreate = true;
  const { hash, order } = await begin();
  assert.equal(order.state, "create_unknown");
  gateway.failCreate = false;
  const retried = await service.retryCreation(order.id, hash);
  assert.equal(retried.state, "created");
  assert.equal(
    gateway.createCalls[0].createKey,
    gateway.createCalls[1].createKey,
  );
  assert.deepEqual(
    gateway.createCalls[0].product,
    gateway.createCalls[1].product,
  );
});
test("buyer cancellation never captures or creates a Twin", async () => {
  const { hash, order } = await begin();
  assert.equal((await service.cancel(order.id, hash)).state, "cancelled");
  assert.equal((await service.capture(order.id, hash)).state, "cancelled");
  assert.equal(gateway.captureCalls.length, 0);
});
test("unapproved orders cannot be captured or marked completed", async () => {
  gateway.status = "CREATED";
  const { hash, order } = await begin();
  const result = await service.capture(order.id, hash);
  assert.equal(result.state, "created");
  assert.equal(result.twinId, null);
  assert.equal(gateway.captureCalls.length, 0);
});
test("declined payments remain failed and never create a Twin", async () => {
  gateway.captureError = "INSTRUMENT_DECLINED";
  const { hash, order } = await begin();
  const result = await service.capture(order.id, hash);
  assert.equal(result.state, "failed");
  assert.equal(result.twinId, null);
  await service.capture(order.id, hash);
  assert.equal(gateway.captureCalls.length, 1);
});
test("timeout after provider completion reconciles without a second capture", async () => {
  gateway.captureError = "provider_unavailable";
  gateway.completeBeforeError = true;
  const { hash, order } = await begin();
  assert.equal((await service.capture(order.id, hash)).state, "pending");
  const reconciled = await service.capture(order.id, hash);
  assert.equal(reconciled.state, "completed");
  assert.ok(reconciled.twinId);
  assert.equal(gateway.captureCalls.length, 1);
});
test("an unresolved capture is never blindly retried and cannot be locally cancelled", async () => {
  gateway.captureError = "provider_unavailable";
  const { hash, order } = await begin();
  assert.equal((await service.capture(order.id, hash)).state, "pending");
  assert.equal((await service.capture(order.id, hash)).state, "pending");
  assert.equal(gateway.captureCalls.length, 1);
  await assert.rejects(service.cancel(order.id, hash), {
    message: "cannot_cancel_processing",
  });
});
test("mismatched provider amounts stop before capture and require review", async () => {
  gateway.tamperAmount = true;
  const { hash, order } = await begin();
  const result = await service.capture(order.id, hash);
  assert.equal(result.state, "review");
  assert.equal(result.twinId, null);
  assert.equal(gateway.captureCalls.length, 0);
});
test("a pending provider capture has no Twin until it becomes completed", async () => {
  gateway.captureStatus = "PENDING";
  const { hash, order } = await begin();
  const pending = await service.capture(order.id, hash);
  assert.equal(pending.state, "pending");
  assert.equal(pending.twinId, null);
  gateway.captureStatus = "COMPLETED";
  assert.equal((await service.capture(order.id, hash)).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
});
test("concurrent capture requests acquire one durable lease", async () => {
  const { hash, order } = await begin();
  let release!: () => void;
  gateway.retrieveGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = service.capture(order.id, hash);
  // Wait for the first operation's persisted lease, not an arbitrary timing delay.
  for (let i = 0; i < 100; i++) {
    const [row] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, order.id));
    if (row.leaseToken) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try {
    await assert.rejects(service.capture(order.id, hash), {
      message: "operation_in_progress",
    });
  } finally {
    release();
  }
  assert.equal((await first).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
});
test("another anonymous session cannot inspect, cancel or capture the order", async () => {
  const { order } = await begin();
  const other = newSession();
  for (const operation of [
    () => service.view(order.id, other),
    () => service.capture(order.id, other),
    () => service.cancel(order.id, other),
  ])
    await assert.rejects(operation, { message: "checkout_not_found" });
});
test("global limits cannot be bypassed by rotating anonymous sessions", async () => {
  for (let i = 0; i < 10; i++) await begin();
  await assert.rejects(begin(), { message: "demo_limit_reached" });
  assert.equal(gateway.createCalls.length, 10);
});
test("per-session order budget is persistent", async () => {
  const hash = newSession();
  for (let i = 0; i < 3; i++) await begin(hash);
  await assert.rejects(begin(hash), { message: "demo_limit_reached" });
});
test("expired orders cannot initiate a capture", async () => {
  const { hash, order } = await begin();
  await db
    .update(checkoutOrders)
    .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(checkoutOrders.id, order.id));
  const result = await service.capture(order.id, hash);
  assert.equal(result.error, "checkout_expired");
  assert.equal(result.state, "expired");
  assert.equal(result.approvalUrl, null);
  assert.equal(gateway.retrieveCalls.length, 0);
  assert.equal(gateway.captureCalls.length, 0);
  assert.equal(result.twinId, null);
});

test("view derives expiry without mutation and repeated start/capture cannot revive an unapproved order", async () => {
  gateway.status = "CREATED";
  const { hash, order, requestId } = await begin();
  await db
    .update(checkoutOrders)
    .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(checkoutOrders.id, order.id));
  const [before] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  const expired = await service.view(order.id, hash);
  assert.equal(expired.state, "expired");
  assert.equal(expired.approvalUrl, null);
  assert.equal(expired.captureAttempted, false);
  assert.equal(expired.expiresAt, new Date(before.expiresAt).toISOString());
  assert.equal(
    (await service.start({ productId: order.product.id, requestId }, hash))
      .state,
    "expired",
  );
  assert.equal((await service.capture(order.id, hash)).state, "expired");
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.deepEqual(after, before);
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(gateway.retrieveCalls.length, 0);
  assert.equal(gateway.captureCalls.length, 0);
  // Retire only the local unattempted checkout, keeping provider IDs/keys/deadline.
  assert.equal((await service.cancel(order.id, hash)).state, "cancelled");
  assert.equal((await service.capture(order.id, hash)).state, "cancelled");
  const [retired] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(retired.providerOrderId, before.providerOrderId);
  assert.equal(retired.captureKey, before.captureKey);
  assert.equal(retired.expiresAt, before.expiresAt);
  assert.equal(retired.captureAttemptedAt, null);
});

test("expired ambiguous creation cannot retry the provider with an expired idempotency window", async () => {
  gateway.failCreate = true;
  const { hash, order } = await begin();
  await db
    .update(checkoutOrders)
    .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(checkoutOrders.id, order.id));
  assert.equal((await service.retryCreation(order.id, hash)).state, "expired");
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(gateway.captureCalls.length, 0);
});

test("an already attempted capture reconciles after expiry without another capture", async () => {
  gateway.captureError = "provider_unavailable";
  gateway.completeBeforeError = true;
  const { hash, order } = await begin();
  assert.equal((await service.capture(order.id, hash)).state, "pending");
  await db
    .update(checkoutOrders)
    .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(checkoutOrders.id, order.id));
  const pending = await service.view(order.id, hash);
  assert.equal(pending.state, "pending");
  assert.equal(pending.captureAttempted, true);
  const result = await service.capture(order.id, hash);
  assert.equal(result.state, "completed");
  assert.ok(result.twinId);
  assert.equal(gateway.captureCalls.length, 1);
});

test("concurrent creation of the same browser request makes one provider order", async () => {
  const hash = newSession();
  const requestId = randomUUID();
  const input = { productId: demoData.products[0].id, requestId };
  const results = await Promise.allSettled([
    service.start(input, hash),
    service.start(input, hash),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  assert.equal(new Set(fulfilled.map((result) => result.value.id)).size, 1);
  assert.equal(gateway.createCalls.length, 1);
});

test("a repeated initial request cannot create another order after its cookie is lost", async () => {
  const { requestId } = await begin();
  await assert.rejects(
    service.start(
      { productId: demoData.products[0].id, requestId },
      newSession(),
    ),
    { message: "checkout_session_lost" },
  );
  assert.equal(gateway.createCalls.length, 1);
});

test("saved product/price survives later catalog changes and is used by the vault", async () => {
  const { hash, order } = await begin();
  const original = demoData.products[0];
  try {
    await db
      .update(products)
      .set({ name: "Changed after checkout", priceMinor: 100 })
      .where(eq(products.id, original.id));
    const result = await service.capture(order.id, hash);
    assert.equal(result.state, "completed");
    const data = await readDemoData(db);
    const record = findTwin(data, result.twinId!)!;
    assert.equal(record.product.name, original.name);
    assert.equal(record.twin.purchasePriceMinor, 12900);
    assert.equal(data.twins[0].id, result.twinId);
  } finally {
    await db
      .update(products)
      .set({ name: original.name, priceMinor: original.priceMinor })
      .where(eq(products.id, original.id));
  }
});

test("a document-write failure rolls back completion and later reconciles without another capture", async () => {
  const { hash, order } = await begin();
  const [saved] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  await db
    .update(checkoutOrders)
    .set({ policy: { ...saved.policy, content: "" } })
    .where(eq(checkoutOrders.id, order.id));
  const failed = await service.capture(order.id, hash);
  assert.equal(failed.state, "pending");
  assert.equal(failed.twinId, null);
  const [pending] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(pending.providerCaptureId, null);
  assert.equal(pending.verifiedAt, null);
  await db
    .update(checkoutOrders)
    .set({ policy: saved.policy })
    .where(eq(checkoutOrders.id, order.id));
  assert.equal((await service.capture(order.id, hash)).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
});
