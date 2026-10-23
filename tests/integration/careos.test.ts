import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import { PostgresStore } from "../../src/lib/careos/postgres-store";
import { deterministicAnswer } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";
import "../../scripts/environment";
import { testRuntimeRoles } from "../helpers/runtime-roles";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error(
    "CareOS integration requires an explicit local dedicated TEST_DATABASE_URL ending _test.",
  );
const { db, pool } = createDatabase(url);
const owners: string[] = [];
const owner = () => {
  const value = randomUUID().replaceAll("-", "");
  owners.push(value);
  return value;
};
const input = () => ({
  requestId: randomUUID(),
  twinId: demoData.twins[0].id,
  revision: 1,
  message: "Find receipt",
});
const store = () =>
  new PostgresStore(pool, {
    dailyMicro: 80000,
    totalMicro: 80000,
    budgetId: "integration-only",
  });
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
});
beforeEach(async () => {
  // These four tables exist only in the explicitly dedicated test database.
  await pool.query("delete from care_conversations");
  await pool.query("delete from care_buckets");
});
after(async () => {
  await pool.query(
    "delete from care_conversations where owner=any($1::text[])",
    [owners],
  );
  await pool.query("delete from care_buckets");
  await pool.end();
});

test("PostgreSQL conversations survive a new service instance and reject a different owner", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  const turn = {
    requestId: i.requestId,
    message: i.message,
    answer: deterministicAnswer(demoData, i),
  };
  await s.finish(c.id, o, turn);
  assert.deepEqual((await store().get(c.id, o)).turns, [turn]);
  await assert.rejects(s.get(c.id, owner()), { status: 404 });
  assert.deepEqual(await s.claim(c.id, o, i), turn);
  await assert.rejects(s.claim(c.id, o, { ...i, message: "changed" }), {
    status: 409,
  });
});
test("simultaneous turns cannot acquire the same conversation twice", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o);
  const results = await Promise.allSettled([
    s.claim(c.id, o, input()),
    s.claim(c.id, o, input()),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
});
test("an unknown request cannot be retried or reused after its lease expires", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  await pool.query(
    "update care_conversations set pending_until=now()-interval '1 second' where id=$1",
    [c.id],
  );
  await assert.rejects(s.claim(c.id, o, i), { status: 409 });
  assert.equal(await s.claim(c.id, o, input()), null);
  await assert.rejects(s.reserve(c.id, o, i.requestId), { status: 409 });
});
test("expiry revokes access and clearing content does not clear spending counters", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  await s.reserve(c.id, o, i.requestId);
  await s.finish(c.id, o, {
    requestId: i.requestId,
    message: i.message,
    answer: deterministicAnswer(demoData, i),
  });
  await s.clear(c.id, o);
  await assert.rejects(s.get(c.id, o), { status: 404 });
  assert.equal(
    (
      await pool.query(
        "select amount from care_buckets where key='spend:total:integration-only'",
      )
    ).rows[0].amount,
    40000,
  );
  const expired = await s.create(o);
  await pool.query(
    "update care_conversations set expires_at=now()-interval '1 second' where id=$1",
    [expired.id],
  );
  await assert.rejects(s.get(expired.id, o), { status: 404 });
});
test("session turn quota is persistent across instances", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o);
  for (let n = 0; n < 6; n++) {
    const i = input();
    await s.claim(c.id, o, i);
    await s.finish(c.id, o, {
      requestId: i.requestId,
      message: i.message,
      answer: deterministicAnswer(demoData, i),
    });
  }
  await assert.rejects(store().claim(c.id, o, input()), { status: 429 });
});
test("paid reservations are atomic across concurrent sessions and survive unknown outcomes", async () => {
  const s = store();
  const attempts = await Promise.all(
    [0, 1, 2].map(async () => {
      const o = owner(),
        c = await s.create(o),
        i = input();
      await s.claim(c.id, o, i);
      return { o, c, i };
    }),
  );
  const results = await Promise.allSettled(
    attempts.map((a) => s.reserve(a.c.id, a.o, a.i.requestId)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    (
      await pool.query(
        "select amount from care_buckets where key='spend:total:integration-only'",
      )
    ).rows[0].amount,
    80000,
  );
});
test("known token usage releases only unused reservation and identical settlement is idempotent", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  const reservation = await s.reserve(c.id, o, i.requestId);
  await s.settle(c.id, o, i.requestId, reservation, 1000);
  assert.equal(
    (
      await pool.query(
        "select amount from care_buckets where key='spend:total:integration-only'",
      )
    ).rows[0].amount,
    1000,
  );
  await s.settle(c.id, o, i.requestId, reservation, 1000);
  await assert.rejects(s.settle(c.id, o, i.requestId, reservation, 2000), {
    status: 409,
  });
  await s.reserve(c.id, o, i.requestId);
  await assert.rejects(s.reserve(c.id, o, i.requestId), { status: 429 });
});
test("disabled budgets reject before a model dispatch can be authorized", async () => {
  const s = new PostgresStore(pool),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  await assert.rejects(s.reserve(c.id, o, i.requestId), { status: 429 });
  assert.equal(
    (
      await pool.query("select provider_calls from care_requests where id=$1", [
        i.requestId,
      ])
    ).rows[0].provider_calls,
    0,
  );
});
test("live permission preflight rejects a commerce-capable writer before spending", async () => {
  const s = new PostgresStore(
      pool,
      { dailyMicro: 80000, totalMicro: 80000, budgetId: "test-role" },
      true,
    ),
    o = owner();
  await assert.rejects(s.create(o), {
    code: "careos_writer_not_restricted",
  });
});
test("CareOS interactions leave all commerce tables unchanged", async () => {
  const snapshot = async () =>
    (
      await pool.query(
        "select (select jsonb_agg(t order by id) from checkout_orders t) as orders, (select jsonb_agg(t order by id) from purchase_twins t) as twins, (select jsonb_agg(t order by id) from documents t) as documents, (select jsonb_agg(t order by id) from care_events t) as events",
      )
    ).rows[0];
  const before = await snapshot(),
    s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  await s.finish(c.id, o, {
    requestId: i.requestId,
    message: i.message,
    answer: deterministicAnswer(demoData, i),
  });
  await s.clear(c.id, o);
  assert.deepEqual(await snapshot(), before);
});

for (const usages of [
  [null, 1000],
  [1000, null],
  [null, null],
  [1000, 2000],
] as const) {
  test(`per-call reservations settle independently: ${JSON.stringify(usages)}`, async () => {
    const s = store(),
      o = owner(),
      c = await s.create(o),
      i = input();
    await s.claim(c.id, o, i);
    const calls = [
      await s.reserve(c.id, o, i.requestId),
      await s.reserve(c.id, o, i.requestId),
    ];
    // Reverse order proves no sequential-settlement dependency.
    for (const n of [1, 0])
      if (usages[n] !== null)
        await s.settle(c.id, o, i.requestId, calls[n], usages[n]!);
    const expected = usages.reduce<number>((sum, v) => sum + (v ?? 40000), 0);
    assert.equal(
      (
        await pool.query(
          "select amount from care_buckets where key='spend:total:integration-only'",
        )
      ).rows[0].amount,
      expected,
    );
    const restarted = store();
    if (usages[1] !== null)
      await restarted.settle(c.id, o, i.requestId, calls[1], usages[1]);
    await s.finish(c.id, o, {
      requestId: i.requestId,
      message: i.message,
      answer: deterministicAnswer(demoData, i),
    });
    await s.clear(c.id, o);
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from care_model_calls where request_id=$1",
          [i.requestId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await pool.query(
          "select amount from care_buckets where key='spend:total:integration-only'",
        )
      ).rows[0].amount,
      expected,
    );
  });
}

test("concurrent settlement releases once, rejects changed usage and ignores supplied bucket substitutions", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  const reservation = await s.reserve(c.id, o, i.requestId);
  await assert.rejects(
    s.settle(c.id, o, i.requestId, { ...reservation, keys: ["wrong"] }, 1000),
    { code: "careos_usage_conflict" },
  );
  await Promise.all([
    s.settle(c.id, o, i.requestId, reservation, 1000),
    store().settle(c.id, o, i.requestId, reservation, 1000),
  ]);
  await assert.rejects(s.settle(c.id, o, i.requestId, reservation, 2000), {
    code: "careos_usage_conflict",
  });
  assert.equal(
    (
      await pool.query("select amount from care_buckets where key=$1", [
        reservation.keys[1],
      ])
    ).rows[0].amount,
    1000,
  );
});

test("settlement uses original day buckets across UTC midnight and leaves the next reservation separate", async () => {
  let clock = Date.now();
  const s = new PostgresStore(
    pool,
    { dailyMicro: 80000, totalMicro: 80000, budgetId: "date-test" },
    false,
    () => clock,
  );
  const o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  const first = await s.reserve(c.id, o, i.requestId);
  clock += 86400000;
  const second = await s.reserve(c.id, o, i.requestId);
  assert.notEqual(first.keys[0], second.keys[0]);
  await s.settle(c.id, o, i.requestId, second, 2000);
  await s.settle(c.id, o, i.requestId, first, 1000);
  assert.equal(
    (
      await pool.query("select amount from care_buckets where key=$1", [
        first.keys[0],
      ])
    ).rows[0].amount,
    1000,
  );
  assert.equal(
    (
      await pool.query("select amount from care_buckets where key=$1", [
        second.keys[0],
      ])
    ).rows[0].amount,
    2000,
  );
  assert.equal(
    (
      await pool.query("select amount from care_buckets where key=$1", [
        first.keys[1],
      ])
    ).rows[0].amount,
    3000,
  );
});

test("failed settlement rolls back all releases; an overrun commits a persistent budget block", async () => {
  const s = store(),
    o = owner(),
    c = await s.create(o),
    i = input();
  await s.claim(c.id, o, i);
  const reservation = await s.reserve(c.id, o, i.requestId);
  await pool.query("delete from care_buckets where key=$1", [
    reservation.keys[1],
  ]);
  await assert.rejects(s.settle(c.id, o, i.requestId, reservation, 1000), {
    code: "careos_usage_conflict",
  });
  assert.equal(
    (
      await pool.query("select amount from care_buckets where key=$1", [
        reservation.keys[0],
      ])
    ).rows[0].amount,
    40000,
  );
  assert.equal(
    (
      await pool.query(
        "select actual_micro from care_model_calls where request_id=$1",
        [i.requestId],
      )
    ).rows[0].actual_micro,
    null,
  );
  await pool.query("insert into care_buckets(key,amount) values($1,40000)", [
    reservation.keys[1],
  ]);
  await assert.rejects(s.settle(c.id, o, i.requestId, reservation, 40001), {
    code: "careos_usage_exceeded_reservation",
  });
  await assert.rejects(store().reserve(c.id, o, i.requestId), {
    code: "careos_budget_blocked",
  });
});

test("legacy aggregate usage is never fabricated; a new call can settle independently under a real CareOS login", async () => {
  const roles = await testRuntimeRoles(url!);
  const restricted = createDatabase(roles.urls.careos);
  try {
    const s = new PostgresStore(
      restricted.pool,
      { dailyMicro: 80000, totalMicro: 80000, budgetId: "legacy-test" },
      true,
    );
    const o = owner(),
      c = await s.create(o),
      i = input();
    await s.claim(c.id, o, i);
    // Represents a pre-upgrade unknown call; no historical usage/backfill invented.
    await pool.query(
      "update care_requests set provider_calls=1,reserved_micro=40000 where id=$1",
      [i.requestId],
    );
    const second = await s.reserve(c.id, o, i.requestId);
    assert.equal(second.call, 2);
    await s.settle(c.id, o, i.requestId, second, 1000);
    assert.equal(
      (
        await pool.query(
          "select reserved_micro from care_requests where id=$1",
          [i.requestId],
        )
      ).rows[0].reserved_micro,
      41000,
    );
    await assert.rejects(
      restricted.pool.query("update documents set content=content"),
      { code: "42501" },
    );
  } finally {
    await restricted.pool.end();
    await roles.close();
  }
});
