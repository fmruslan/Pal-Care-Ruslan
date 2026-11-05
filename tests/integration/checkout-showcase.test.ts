// Synthetic provider proof in disposable dedicated databases, never PayPal evidence.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import { insertDemoCareRows } from "../../scripts/demo-care-data";
import { CheckoutService } from "../../src/lib/commerce/service";
import {
  SHOWCASE_PRODUCT_ID,
  SHOWCASE_REQUEST_ID,
  type ShowcaseScope,
} from "../../src/lib/commerce/showcase";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw Error(
    "Explicit dedicated local TEST_DATABASE_URL ending _test required",
  );
const input = {
  productId: SHOWCASE_PRODUCT_ID,
  requestId: SHOWCASE_REQUEST_ID,
};
const owner = "c".repeat(64);
async function isolated(
  work: (
    db: ReturnType<typeof createDatabase>,
    gateway: FakePayPal,
    scope: ShowcaseScope,
    service: CheckoutService,
  ) => Promise<void>,
) {
  const admin = new Pool({ connectionString: url, max: 1 });
  const name = `showcase_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const target = new URL(url!);
  target.pathname = `/${name}`;
  let database: ReturnType<typeof createDatabase> | undefined;
  let created = false;
  try {
    await admin.query(`create database ${name}`);
    created = true;
    database = createDatabase(target.toString());
    await migrate(database.db, { migrationsFolder: "drizzle" }); // Dedicated test only; application 0016 remains untouched.
    await seedDemo(database.db);
    await migrate(database.db, {
      migrationsFolder: "drizzle/demo-care",
      migrationsTable: "__care_demo_migrations",
    });
    const client = await database.pool.connect();
    try {
      await client.query("begin");
      await insertDemoCareRows(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    const now = Date.now();
    const scope: ShowcaseScope = {
      requestId: SHOWCASE_REQUEST_ID,
      sessionHash: owner,
      balanceConfirmed: true,
      startsAt: new Date(now - 3600000).toISOString(),
      endsAt: new Date(now + 3600000).toISOString(),
    };
    const gateway = new FakePayPal();
    const service = new CheckoutService(database.db, gateway, {
      ...testConfig,
      showcase: scope,
      guardianPolicyEnabled: true,
    });
    await work(database, gateway, scope, service);
  } finally {
    await database?.pool.end();
    if (created) await admin.query(`drop database ${name}`);
    await admin.end();
  }
}

test("one scoped game create/capture independently verifies and adds a Twin, never converts the sample or binds Guardian", async () =>
  isolated(async (db, gateway, _scope, service) => {
    const original = (
      await db.pool.query(
        "select to_jsonb(t) value from purchase_twins t where id='00000000-0000-4000-8000-000000000210'",
      )
    ).rows[0].value;
    const order = await service.start(input, owner);
    assert.equal(order.product.priceMinor, 6499);
    assert.equal(gateway.createCalls.length, 1);
    const completed = await service.capture(order.id, owner);
    assert.equal(completed.state, "completed");
    assert.ok(completed.twinId);
    assert.equal(gateway.captureCalls.length, 1);
    assert.ok(gateway.retrieveCalls.length >= 2);
    assert.equal(gateway.retrieveCaptureCalls.length, 1);
    await service.start(input, owner);
    await service.capture(order.id, owner);
    assert.equal(gateway.createCalls.length, 1);
    assert.equal(gateway.captureCalls.length, 1);
    assert.equal(
      (await db.pool.query("select count(*)::int n from purchase_twins"))
        .rows[0].n,
      11,
    );
    assert.deepEqual(
      (
        await db.pool.query(
          "select to_jsonb(t) value from purchase_twins t where id='00000000-0000-4000-8000-000000000210'",
        )
      ).rows[0].value,
      original,
    );
    assert.equal(
      (await db.pool.query("select count(*)::int n from guardian_bindings"))
        .rows[0].n,
      0,
    );
  }));

test("ambiguous showcase creation never replays POST, even through the existing retry route", async () =>
  isolated(async (_db, gateway, _scope, service) => {
    gateway.failCreate = true;
    const order = await service.start(input, owner);
    assert.equal(order.state, "create_unknown");
    gateway.failCreate = false;
    await service.start(input, owner);
    await service.retryCreation(order.id, owner);
    assert.equal(gateway.createCalls.length, 1);
    assert.equal(gateway.captureCalls.length, 0);
  }));

test("uncertain showcase capture retains its marker, permits only three retrieval cycles and stops without a replacement scope", async () =>
  isolated(async (db, gateway, scope, service) => {
    const order = await service.start(input, owner);
    gateway.captureError = "provider_unavailable";
    const pending = await service.capture(order.id, owner);
    assert.equal(pending.captureAttempted, true);
    assert.equal(gateway.captureCalls.length, 1);
    for (let i = 0; i < 3; i++) await service.reconcile(order.id, owner);
    const reads = gateway.retrieveCalls.length;
    const exhausted = await service.reconcile(order.id, owner);
    assert.equal(exhausted.error, "demo_limit_reached");
    assert.equal(gateway.retrieveCalls.length, reads);
    assert.equal(gateway.captureCalls.length, 1);
    assert.equal(
      (
        await db.pool.query(
          "select count from checkout_rate_limits where key=$1",
          [`showcase:reconcile:${SHOWCASE_REQUEST_ID}`],
        )
      ).rows[0].count,
      3,
    );
    const disabled = new CheckoutService(db.db, gateway, testConfig);
    await assert.rejects(
      disabled.reconcile(order.id, owner),
      /sandbox_test_not_authorized/,
    );
    const expired = new CheckoutService(db.db, gateway, {
      ...testConfig,
      showcase: {
        ...scope,
        startsAt: new Date(Date.now() - 7200000).toISOString(),
        endsAt: new Date(Date.now() - 1).toISOString(),
      },
    });
    await assert.rejects(
      expired.reconcile(order.id, owner),
      /sandbox_test_not_authorized/,
    );
    assert.equal(gateway.retrieveCalls.length, reads);
  }));

test("unconfirmed balance and wrong session cannot insert a showcase order or dispatch a provider call", async () =>
  isolated(async (db, gateway, scope, service) => {
    const unconfirmed = new CheckoutService(db.db, gateway, {
      ...testConfig,
      showcase: { ...scope, balanceConfirmed: false },
    });
    await assert.rejects(
      unconfirmed.start(input, owner),
      /sandbox_test_not_authorized/,
    );
    await assert.rejects(
      service.start(input, "d".repeat(64)),
      /sandbox_test_not_authorized/,
    );
    assert.equal(
      (await db.pool.query("select count(*)::int n from checkout_orders"))
        .rows[0].n,
      0,
    );
    assert.equal(gateway.createCalls.length, 0);
    assert.equal(gateway.captureCalls.length, 0);
  }));

test("repeated unapproved returns also consume the bounded lifetime recovery cycles", async () =>
  isolated(async (_db, gateway, _scope, service) => {
    const order = await service.start(input, owner);
    gateway.status = "CREATED";
    for (let i = 0; i < 4; i++) await service.capture(order.id, owner);
    assert.equal(gateway.retrieveCalls.length, 4);
    const blocked = await service.capture(order.id, owner);
    assert.equal(blocked.error, "demo_limit_reached");
    assert.equal(gateway.retrieveCalls.length, 4);
    assert.equal(gateway.captureCalls.length, 0);
  }));

test("concurrent starts and capture attempts never duplicate a showcase POST", async () =>
  isolated(async (_db, gateway, _scope, service) => {
    await Promise.allSettled([
      service.start(input, owner),
      service.start(input, owner),
    ]);
    assert.equal(gateway.createCalls.length, 1);
    const order = await service.start(input, owner);
    await Promise.allSettled([
      service.capture(order.id, owner),
      service.capture(order.id, owner),
    ]);
    assert.equal(gateway.captureCalls.length, 1);
    assert.equal((await service.view(order.id, owner)).state, "completed");
  }));

test("changing the configured window cannot extend the original order's dispatch authority", async () =>
  isolated(async (db, gateway, scope, service) => {
    const order = await service.start(input, owner);
    const changed = new CheckoutService(db.db, gateway, {
      ...testConfig,
      showcase: {
        ...scope,
        endsAt: new Date(Date.parse(scope.endsAt) - 1000).toISOString(),
      },
    });
    const result = await changed.capture(order.id, owner);
    assert.equal(result.error, "sandbox_test_not_authorized");
    assert.equal(gateway.retrieveCalls.length, 0);
    assert.equal(gateway.captureCalls.length, 0);
  }));
