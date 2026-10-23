// Dedicated PostgreSQL only. Selected real public CPSC fields, injected transport, no network.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import {
  saveRecall,
  markRecallUnavailable,
} from "../../src/lib/safety/service";
import {
  referenceSource,
  REVIEWED_SOURCE_HASH,
} from "../../src/lib/safety/reference";
import { CPSC_ENDPOINT } from "../../src/lib/safety/cpsc";
import { randomUUID } from "node:crypto";
import { CheckoutService } from "../../src/lib/commerce/service";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import { demoData } from "../../src/lib/demo/fixtures";
import { testRuntimeRoles } from "../helpers/runtime-roles";
import "../../scripts/environment";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Explicit dedicated local TEST_DATABASE_URL required.");
const { pool, db } = createDatabase(url);
const snapshot = {
  source: referenceSource,
  hash: REVIEWED_SOURCE_HASH,
  retrievedAt: new Date().toISOString(),
  endpoint: CPSC_ENDPOINT,
};
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
});
after(async () => {
  await pool.query("delete from recall_assessments");
  await pool.query("delete from recall_checks");
  await pool.query("delete from recall_sources");
  await pool.end();
});
test("CPSC ingestion is idempotent and leaves every original financial row unchanged", async () => {
  const tables = [
    "checkout_orders",
    "purchase_twins",
    "documents",
    "care_events",
    "guardian_cases",
    "guardian_refunds",
    "guardian_approvals",
    "guardian_policies",
  ];
  const read = async () => {
    const data = [];
    for (const t of tables)
      data.push(
        (
          await pool.query(
            `select to_jsonb(t) row from ${t} t order by to_jsonb(t)::text`,
          )
        ).rows,
      );
    return data;
  };
  const before = await read();
  await saveRecall(pool, snapshot);
  await saveRecall(pool, snapshot);
  assert.equal(
    (await pool.query("select count(*)::int n from recall_sources")).rows[0].n,
    1,
  );
  assert.deepEqual(await read(), before);
});
test("failed recall retrieval retains the last source rather than claiming a fresh all-clear", async () => {
  await markRecallUnavailable(pool);
  const check = (
    await pool.query("select * from recall_checks where key='reference'")
  ).rows[0];
  assert.equal(check.state, "unavailable");
  assert.equal(check.source_hash, REVIEWED_SOURCE_HASH);
});
test("source revisions cannot be overwritten or saved with a false content hash", async () => {
  await assert.rejects(
    pool.query("update recall_sources set source='{}'::jsonb"),
    { code: "23514" },
  );
  await assert.rejects(saveRecall(pool, { ...snapshot, hash: "0".repeat(64) }));
});

test("bounded recall batches resume past 100, deduplicate, and assess later UUIDs behind an earlier cursor", async () => {
  const gateway = new FakePayPal(),
    checkout = new CheckoutService(db, gateway, testConfig);
  const session = randomUUID().replaceAll("-", "");
  const order = await checkout.start(
    { productId: demoData.products[0].id, requestId: randomUUID() },
    session,
  );
  const completed = await checkout.capture(order.id, session);
  assert.ok(completed.twinId);
  const baseOrder = (
    await pool.query(
      "select to_jsonb(o) row from checkout_orders o where id=$1",
      [order.id],
    )
  ).rows[0].row;
  const baseTwin = (
    await pool.query(
      "select to_jsonb(t) row from purchase_twins t where id=$1",
      [completed.twinId],
    )
  ).rows[0].row;
  const orderIds = [order.id],
    twinIds = [completed.twinId];
  const makeCase = (twinId = randomUUID()) => {
    const id = randomUUID(),
      providerId = `TEST${randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const o = {
      ...baseOrder,
      id,
      session_hash: session,
      request_id: randomUUID(),
      create_key: randomUUID(),
      capture_key: randomUUID(),
      provider_order_id: `O${providerId}`,
      provider_capture_id: `C${providerId}`,
      observed_capture_id: `C${providerId}`,
    };
    const t = {
      ...baseTwin,
      id: twinId,
      checkout_order_id: id,
      paypal_order_id: o.provider_order_id,
      paypal_capture_id: o.provider_capture_id,
    };
    orderIds.push(id);
    twinIds.push(twinId);
    return { o, t };
  };
  const roles = await testRuntimeRoles(url!);
  const restricted = createDatabase(roles.urls.recall);
  try {
    // Synthetic evidence is inserted ONLY in this explicitly dedicated test DB.
    const cases = Array.from({ length: 205 }, () => makeCase());
    await pool.query(
      "insert into checkout_orders select * from jsonb_populate_recordset(null::checkout_orders,$1::jsonb)",
      [JSON.stringify(cases.map((c) => c.o))],
    );
    await pool.query(
      "insert into purchase_twins select * from jsonb_populate_recordset(null::purchase_twins,$1::jsonb)",
      [JSON.stringify(cases.map((c) => c.t))],
    );
    const before = (
      await pool.query(
        "select jsonb_agg(t order by id) rows from purchase_twins t where id=any($1::uuid[])",
        [twinIds],
      )
    ).rows;
    const first = await saveRecall(restricted.pool, snapshot, {
      maxBatches: 1,
    });
    assert.equal(first.assessed, 100);
    assert.equal(first.remaining, true);
    assert.equal(
      (await saveRecall(restricted.pool, snapshot, { maxBatches: 1 })).assessed,
      100,
    );
    assert.deepEqual(
      await saveRecall(restricted.pool, snapshot, { maxBatches: 1 }),
      { assessed: 6, remaining: false },
    );
    assert.deepEqual(await saveRecall(restricted.pool, snapshot), {
      assessed: 0,
      remaining: false,
    });
    assert.deepEqual(
      (
        await pool.query(
          "select jsonb_agg(t order by id) rows from purchase_twins t where id=any($1::uuid[])",
          [twinIds],
        )
      ).rows,
      before,
    );
    const late = makeCase("00000000-0000-4000-8000-000000000001");
    await pool.query(
      "insert into checkout_orders select * from jsonb_populate_record(null::checkout_orders,$1::jsonb)",
      [JSON.stringify(late.o)],
    );
    await pool.query(
      "insert into purchase_twins select * from jsonb_populate_record(null::purchase_twins,$1::jsonb)",
      [JSON.stringify(late.t)],
    );
    assert.deepEqual(await saveRecall(restricted.pool, snapshot), {
      assessed: 1,
      remaining: false,
    });
    assert.equal(
      (
        await pool.query(
          "select count(*)::int n from recall_assessments where twin_id=any($1::uuid[])",
          [twinIds],
        )
      ).rows[0].n,
      207,
    );
    await assert.rejects(
      restricted.pool.query("update checkout_orders set amount_minor=1"),
      { code: "42501" },
    );
  } finally {
    await restricted.pool.end();
    await roles.close();
    await pool.query(
      "delete from recall_assessments where twin_id=any($1::uuid[])",
      [twinIds],
    );
    await pool.query("delete from care_events where twin_id=any($1::uuid[])", [
      twinIds,
    ]);
    await pool.query("delete from documents where twin_id=any($1::uuid[])", [
      twinIds,
    ]);
    await pool.query("delete from purchase_twins where id=any($1::uuid[])", [
      twinIds,
    ]);
    await pool.query("delete from checkout_orders where id=any($1::uuid[])", [
      orderIds,
    ]);
    await pool.query("delete from checkout_rate_limits");
  }
});
