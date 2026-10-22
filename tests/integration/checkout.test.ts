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
import { createOrderBody } from "../../src/lib/commerce/paypal";
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
let forbiddenMutationCalls = 0;
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
  forbiddenMutationCalls = 0;
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
  assert.equal(
    forbiddenMutationCalls,
    0,
    "Reconciliation called a forbidden provider mutation",
  );
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
    () => service.reconcile(order.id, other),
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
  assert.equal(pending.providerCaptureId, null); // Verified-payment reference is atomic with Twin finalization.
  assert.ok(pending.observedCaptureId); // Keep the observed identity despite local finalization rollback.
  assert.equal(pending.verifiedAt, null);
  await db
    .update(checkoutOrders)
    .set({ policy: saved.policy })
    .where(eq(checkoutOrders.id, order.id));
  assert.equal((await service.capture(order.id, hash)).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
});

test("reconciliation-only action rejects an unattempted order without provider calls", async () => {
  const { hash, order } = await begin();
  await assert.rejects(service.reconcile(order.id, hash), {
    message: "capture_not_attempted",
  });
  assert.equal(gateway.retrieveCalls.length, 0);
  assert.equal(gateway.retrieveCaptureCalls.length, 0);
  assert.equal(gateway.captureCalls.length, 0);
});

async function pendingAfterDeadline() {
  gateway.captureStatus = "PENDING";
  const context = await begin();
  const pending = await service.capture(context.order.id, context.hash);
  assert.equal(pending.state, "pending");
  assert.equal(pending.pendingReason, "ECHECK");
  assert.equal(pending.captureStatus, "PENDING");
  await db
    .update(checkoutOrders)
    .set({ expiresAt: new Date(Date.now() - 3600000).toISOString() })
    .where(eq(checkoutOrders.id, context.order.id));
  const [saved] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, context.order.id));
  assert.ok(saved.observedCaptureId);
  assert.equal(saved.providerCaptureId, null);
  assert.ok(saved.captureCheckedAt);
  // From here on, any accidental provider mutation fails the test immediately.
  gateway.capture = async () => {
    forbiddenMutationCalls++;
    assert.fail("Reconciliation must not dispatch another capture");
  };
  gateway.create = async () => {
    forbiddenMutationCalls++;
    assert.fail("Reconciliation must not create another order");
  };
  return { ...context, saved };
}

test("pending eCheck is queried by its pinned capture ID after expiry and remains unverified", async () => {
  const { hash, order, saved } = await pendingAfterDeadline();
  for (let i = 0; i < 2; i++) {
    const result = await service.reconcile(order.id, hash);
    assert.equal(result.state, "pending");
    assert.equal(result.captureStatus, "PENDING");
    assert.equal(result.pendingReason, "ECHECK");
    assert.equal(result.twinId, null);
  }
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(after.observedCaptureId, saved.observedCaptureId);
  assert.equal(after.providerCaptureId, null);
  assert.equal(after.captureAttemptedAt, saved.captureAttemptedAt);
  assert.equal(after.captureKey, saved.captureKey);
  assert.equal(after.createKey, saved.createKey);
  assert.equal(after.expiresAt, saved.expiresAt);
  assert.equal(after.verifiedAt, null);
  assert.equal(after.capturedAt, null);
  assert.ok(
    gateway.retrieveCaptureCalls.every((id) => id === saved.observedCaptureId),
  );
  assert.equal(gateway.captureCalls.length, 1);
});

test("a pending capture observation cannot satisfy a verified Twin's database evidence reference", async () => {
  const { order, saved } = await pendingAfterDeadline();
  await assert.rejects(
    db.insert(purchaseTwins).values({
      ...demoData.twins[0],
      id: randomUUID(),
      checkoutOrderId: order.id,
      paypalOrderId: saved.providerOrderId,
      paypalCaptureId: saved.observedCaptureId,
      purchasePriceMinor: saved.amountMinor,
      verifiedAt: new Date().toISOString(),
      origin: "sandbox",
      productSnapshot: saved.product,
    }),
    (error) => (error as { cause?: { code?: string } }).cause?.code === "23503",
  );
});

test("completed existing capture after expiry creates exactly one Twin, receipt, policy and purchase event", async () => {
  const { hash, order, saved } = await pendingAfterDeadline();
  gateway.captureStatus = "COMPLETED";
  const result = await service.reconcile(order.id, hash);
  assert.equal(result.state, "completed");
  assert.ok(result.twinId);
  assert.equal((await service.reconcile(order.id, hash)).twinId, result.twinId);
  assert.equal((await service.capture(order.id, hash)).twinId, result.twinId);
  const twins = await db
    .select()
    .from(purchaseTwins)
    .where(eq(purchaseTwins.checkoutOrderId, order.id));
  assert.equal(twins.length, 1);
  assert.equal(twins[0].paypalCaptureId, saved.observedCaptureId);
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.twinId, result.twinId));
  assert.equal(
    docs.filter((d) => d.kind === "receipt" && d.origin === "sandbox").length,
    1,
  );
  assert.equal(docs.filter((d) => d.kind === "policy").length, 1);
  const events = await db
    .select()
    .from(careEvents)
    .where(eq(careEvents.twinId, result.twinId));
  assert.equal(
    events.filter((e) => e.kind === "purchase" && e.origin === "sandbox")
      .length,
    1,
  );
  assert.equal(gateway.captureCalls.length, 1);
});

for (const status of ["FAILED", "DECLINED"]) {
  test(`${status} existing capture after expiry produces a terminal failure without a Twin`, async () => {
    const { hash, order, saved } = await pendingAfterDeadline();
    gateway.captureStatus = status;
    const result = await service.reconcile(order.id, hash);
    assert.equal(result.state, "failed");
    assert.equal(result.captureStatus, status);
    assert.equal(result.pendingReason, null);
    assert.equal(result.error, `capture_${status.toLowerCase()}`);
    assert.equal(result.twinId, null);
    assert.equal((await service.capture(order.id, hash)).state, "failed");
    assert.equal((await service.reconcile(order.id, hash)).state, "failed");
    const [after] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, order.id));
    assert.equal(after.observedCaptureId, saved.observedCaptureId);
    assert.equal(after.providerCaptureId, null);
    assert.equal(after.captureAttemptedAt, saved.captureAttemptedAt);
    assert.equal(after.verifiedAt, null);
    assert.equal(after.capturedAt, null);
    assert.equal(gateway.captureCalls.length, 1);
  });
}

test("Orders v2 completion alone cannot finalize when Payments v2 is pending", async () => {
  const { hash, order } = await pendingAfterDeadline();
  gateway.captureStatus = "COMPLETED";
  gateway.paymentsCaptureStatus = "PENDING";
  const result = await service.reconcile(order.id, hash);
  assert.equal(result.state, "pending");
  assert.equal(result.captureStatus, "PENDING");
  assert.equal(result.twinId, null);
});

test("Payments v2 completion alone cannot finalize while Orders v2 capture is still pending", async () => {
  const { hash, order } = await pendingAfterDeadline();
  gateway.paymentsCaptureStatus = "COMPLETED";
  const result = await service.reconcile(order.id, hash);
  assert.equal(result.state, "pending");
  assert.equal(result.captureStatus, "COMPLETED");
  assert.equal(result.twinId, null);
});

test("mismatched independent Payments v2 evidence requires review and retains pinned identity", async () => {
  const { hash, order, saved } = await pendingAfterDeadline();
  gateway.captureStatus = "COMPLETED";
  gateway.tamperCaptureAmount = true;
  const result = await service.reconcile(order.id, hash);
  assert.equal(result.state, "review");
  assert.equal(result.twinId, null);
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(after.observedCaptureId, saved.observedCaptureId);
  assert.equal(after.providerCaptureId, null);
  assert.equal(after.verifiedAt, null);
});

test("a different capture cannot replace the original pinned capture", async () => {
  const { hash, order, saved } = await pendingAfterDeadline();
  gateway.captureIdOverride = "DIFFERENTCAPTURE1";
  const result = await service.reconcile(order.id, hash);
  assert.equal(result.state, "review");
  assert.equal(result.twinId, null);
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(after.observedCaptureId, saved.observedCaptureId);
  assert.equal(after.providerCaptureId, null);
});

test("Payments retrieval timeout remains pending and later settles without recapture", async () => {
  const { hash, order } = await pendingAfterDeadline();
  gateway.failRetrieveCapture = true;
  assert.equal((await service.reconcile(order.id, hash)).state, "pending");
  gateway.failRetrieveCapture = false;
  gateway.captureStatus = "COMPLETED";
  assert.equal((await service.reconcile(order.id, hash)).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
});

test("concurrent reconciliation checks share the lease and finalize once", async () => {
  const { hash, order } = await pendingAfterDeadline();
  gateway.captureStatus = "COMPLETED";
  let release!: () => void;
  gateway.retrieveGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = service.reconcile(order.id, hash);
  for (let i = 0; i < 100; i++) {
    const [row] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, order.id));
    if (row.leaseToken) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  try {
    await assert.rejects(service.reconcile(order.id, hash), {
      message: "operation_in_progress",
    });
  } finally {
    release();
  }
  assert.equal((await first).state, "completed");
  assert.equal(gateway.captureCalls.length, 1);
  assert.equal(
    (
      await db
        .select()
        .from(purchaseTwins)
        .where(eq(purchaseTwins.checkoutOrderId, order.id))
    ).length,
    1,
  );
});

test("reconciliation retains persistent per-order provider limits", async () => {
  const { hash, order } = await pendingAfterDeadline();
  // Creation and initial capture already consumed two leases in this bucket.
  for (let i = 0; i < 18; i++)
    assert.equal((await service.reconcile(order.id, hash)).state, "pending");
  await assert.rejects(service.reconcile(order.id, hash), {
    message: "demo_limit_reached",
  });
  assert.equal(gateway.captureCalls.length, 1);
});

test("database rejects unchecked capture observations and orphaned pending reasons", async () => {
  const { order } = await begin();
  await assert.rejects(
    db
      .update(checkoutOrders)
      .set({ captureStatus: "PENDING" })
      .where(eq(checkoutOrders.id, order.id)),
    (error) => (error as { cause?: { code?: string } }).cause?.code === "23514",
  );
  await assert.rejects(
    db
      .update(checkoutOrders)
      .set({ capturePendingReason: "ECHECK" })
      .where(eq(checkoutOrders.id, order.id)),
    (error) => (error as { cause?: { code?: string } }).cause?.code === "23514",
  );
  const [saved] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, order.id));
  assert.equal(saved.captureStatus, null);
  assert.equal(saved.capturePendingReason, null);
});

function immediateScope(
  hash = newSession(),
  requestId = randomUUID(),
  balanceConfirmed = true,
) {
  return {
    hash,
    requestId,
    service: new CheckoutService(db, gateway, {
      ...testConfig,
      immediateTest: { sessionHash: hash, requestId, balanceConfirmed },
    }),
  };
}

test("unconfirmed balance blocks the new test without altering an existing pending eCheck", async () => {
  gateway.captureStatus = "PENDING";
  const original = await begin();
  await service.capture(original.order.id, original.hash);
  const [before] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, original.order.id));
  const bodyBefore = createOrderBody(before);
  const scope = immediateScope(original.hash, randomUUID(), false);
  await assert.rejects(
    scope.service.start(
      { productId: demoData.products[0].id, requestId: scope.requestId },
      scope.hash,
    ),
    { message: "sandbox_balance_confirmation_required" },
  );
  assert.equal(
    (
      await scope.service.start(
        { productId: demoData.products[0].id, requestId: original.requestId },
        original.hash,
      )
    ).id,
    original.order.id,
  );
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, original.order.id));
  assert.deepEqual(after, before);
  assert.deepEqual(createOrderBody(after), bodyBefore);
  assert.equal(after.paymentMethodPreference, null);
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(gateway.captureCalls.length, 1);
});

test("one approved immediate test snapshots preference before provider creation and cannot allocate a second order", async () => {
  const scope = immediateScope();
  const create = gateway.create.bind(gateway);
  gateway.create = async (saved) => {
    const [persisted] = await db
      .select()
      .from(checkoutOrders)
      .where(eq(checkoutOrders.id, saved.id));
    assert.equal(
      persisted.paymentMethodPreference,
      "IMMEDIATE_PAYMENT_REQUIRED",
    );
    assert.ok(persisted.createKey);
    assert.ok(persisted.captureKey);
    return create(saved);
  };
  const input = {
    productId: demoData.products[0].id,
    requestId: scope.requestId,
  };
  const result = await scope.service.start(input, scope.hash);
  assert.equal((await scope.service.start(input, scope.hash)).id, result.id);
  await assert.rejects(
    scope.service.start({ ...input, requestId: randomUUID() }, scope.hash),
    { message: "sandbox_test_not_authorized" },
  );
  assert.equal(gateway.createCalls.length, 1);
  assert.equal(gateway.captureCalls.length, 0);
  assert.equal(
    gateway.createCalls[0].paymentMethodPreference,
    "IMMEDIATE_PAYMENT_REQUIRED",
  );
  assert.equal(
    createOrderBody(gateway.createCalls[0]).paymentSource.paypal
      .experienceContext.paymentMethodPreference,
    "IMMEDIATE_PAYMENT_REQUIRED",
  );
  assert.equal(
    (
      await db
        .select()
        .from(checkoutOrders)
        .where(eq(checkoutOrders.sessionHash, scope.hash))
    ).length,
    1,
  );
});

for (const wrong of ["session", "request", "product"]) {
  test(`immediate test rejects the wrong ${wrong} before any provider or checkout insertion`, async () => {
    const scope = immediateScope();
    const hash = wrong === "session" ? newSession() : scope.hash;
    const input = {
      productId: demoData.products[wrong === "product" ? 1 : 0].id,
      requestId: wrong === "request" ? randomUUID() : scope.requestId,
    };
    await assert.rejects(scope.service.start(input, hash), {
      message: "sandbox_test_not_authorized",
    });
    assert.equal(gateway.createCalls.length, 0);
    assert.equal(gateway.captureCalls.length, 0);
    assert.equal(
      (
        await db
          .select()
          .from(checkoutOrders)
          .where(eq(checkoutOrders.requestId, input.requestId))
      ).length,
      0,
    );
  });
}

test("immediate test refuses a changed catalog price rather than changing the approved USD 129 amount", async () => {
  const scope = immediateScope();
  try {
    await db
      .update(products)
      .set({ priceMinor: 12899 })
      .where(eq(products.id, demoData.products[0].id));
    await assert.rejects(
      scope.service.start(
        { productId: demoData.products[0].id, requestId: scope.requestId },
        scope.hash,
      ),
      { message: "sandbox_test_price_changed" },
    );
    assert.equal(gateway.createCalls.length, 0);
  } finally {
    await db
      .update(products)
      .set({ priceMinor: 12900 })
      .where(eq(products.id, demoData.products[0].id));
  }
});

test("concurrent requests for the immediate test still create one provider order and retain cookie ownership", async () => {
  const scope = immediateScope();
  const input = {
    productId: demoData.products[0].id,
    requestId: scope.requestId,
  };
  const results = await Promise.allSettled([
    scope.service.start(input, scope.hash),
    scope.service.start(input, scope.hash),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length);
  assert.equal(new Set(fulfilled.map((r) => r.value.id)).size, 1);
  assert.equal(gateway.createCalls.length, 1);
  await assert.rejects(scope.service.start(input, newSession()), {
    message: "checkout_session_lost",
  });
});

test("an immediate test creation retry preserves the saved preference, payload, keys and deadline across configuration changes", async () => {
  const scope = immediateScope();
  gateway.failCreate = true;
  const created = await scope.service.start(
    { productId: demoData.products[0].id, requestId: scope.requestId },
    scope.hash,
  );
  assert.equal(created.state, "create_unknown");
  const [before] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, created.id));
  gateway.failCreate = false;
  const restarted = new CheckoutService(db, gateway, testConfig);
  assert.equal(
    (await restarted.retryCreation(created.id, scope.hash)).state,
    "created",
  );
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, created.id));
  assert.equal(after.paymentMethodPreference, "IMMEDIATE_PAYMENT_REQUIRED");
  assert.equal(after.createKey, before.createKey);
  assert.equal(after.captureKey, before.captureKey);
  assert.equal(after.expiresAt, before.expiresAt);
  assert.deepEqual(
    createOrderBody(gateway.createCalls[0]),
    createOrderBody(gateway.createCalls[1]),
  );
});

test("a completed immediate test creates its own Twin without changing the separate pending payment", async () => {
  gateway.captureStatus = "PENDING";
  const original = await begin();
  await service.capture(original.order.id, original.hash);
  const [before] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, original.order.id));
  gateway.status = "APPROVED";
  gateway.captureStatus = "COMPLETED";
  const scope = immediateScope(original.hash);
  const created = await scope.service.start(
    { productId: demoData.products[0].id, requestId: scope.requestId },
    scope.hash,
  );
  const completed = await scope.service.capture(created.id, scope.hash);
  assert.equal(completed.state, "completed");
  assert.ok(completed.twinId);
  const [after] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, original.order.id));
  assert.deepEqual(after, before);
  const [newOrder] = await db
    .select()
    .from(checkoutOrders)
    .where(eq(checkoutOrders.id, created.id));
  assert.notEqual(newOrder.createKey, before.createKey);
  assert.notEqual(newOrder.captureKey, before.captureKey);
  assert.notEqual(newOrder.providerOrderId, before.providerOrderId);
  assert.equal(newOrder.paymentMethodPreference, "IMMEDIATE_PAYMENT_REQUIRED");
  assert.equal(
    (
      await db
        .select()
        .from(purchaseTwins)
        .where(eq(purchaseTwins.checkoutOrderId, original.order.id))
    ).length,
    0,
  );
  assert.equal(
    (await scope.service.reconcile(created.id, scope.hash)).twinId,
    completed.twinId,
  );
  assert.equal(gateway.captureCalls.length, 2);
});

test("an unexpected pending response on an immediate test still cannot create a verified Twin", async () => {
  const scope = immediateScope();
  gateway.captureStatus = "PENDING";
  const created = await scope.service.start(
    { productId: demoData.products[0].id, requestId: scope.requestId },
    scope.hash,
  );
  const pending = await scope.service.capture(created.id, scope.hash);
  assert.equal(pending.state, "pending");
  assert.equal(pending.twinId, null);
  assert.equal(
    (await scope.service.reconcile(created.id, scope.hash)).twinId,
    null,
  );
  assert.equal(gateway.captureCalls.length, 1);
});
