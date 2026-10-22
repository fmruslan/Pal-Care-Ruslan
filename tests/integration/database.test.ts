import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import { readDemoData } from "../../src/db/read-demo";
import {
  demoData,
  CUSTOMER_ID,
  MERCHANT_ID,
} from "../../src/lib/demo/fixtures";
import "../../scripts/environment";

// An explicit TEST_DATABASE_URL prevents accidental integration writes to a deployed DB.
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated test database before integration tests.",
  );
const { db, pool } = createDatabase(url);

before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
  await seedDemo(db);
});
after(async () => {
  await pool.end();
});

test("migrations and sample seed can run twice without duplicate records", async () => {
  const data = await readDemoData(db);
  assert.equal(data.customer.id, CUSTOMER_ID);
  assert.equal(data.merchant.id, MERCHANT_ID);
  assert.equal(data.products.length, 3);
  assert.equal(data.twins.length, 3);
  assert.equal(data.documents.length, 3);
  assert.equal(data.events.length, 3);
  assert.deepEqual(data.products, demoData.products);
});

test("runtime connection rejects writes at the PostgreSQL session boundary", async () => {
  const runtime = createDatabase(url, { readOnly: true });
  try {
    await assert.rejects(
      runtime.pool.query("update products set price_minor = 0"),
      { code: "25006" },
    );
    const data = await readDemoData(runtime.db);
    assert.equal(data.products[0].priceMinor, 12900);
  } finally {
    await runtime.pool.end();
  }
});

async function rejectedWrite(query: string, params: unknown[], code: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await assert.rejects(client.query(query, params), { code });
  } finally {
    await client.query("rollback");
    client.release();
  }
}

test("database rejects negative prices and unsupported currency", async () => {
  await rejectedWrite(
    "update products set price_minor = -1 where id = $1",
    [demoData.products[0].id],
    "23514",
  );
  await rejectedWrite(
    "update purchase_twins set currency = 'JPY' where id = $1",
    [demoData.twins[0].id],
    "23514",
  );
});

test("sample twins cannot be relabeled as verified sandbox payments", async () => {
  await rejectedWrite(
    "update purchase_twins set origin = 'sandbox' where id = $1",
    [demoData.twins[0].id],
    "23514",
  );
  await rejectedWrite(
    "update care_events set origin = 'verified' where id = $1",
    [demoData.events[0].id],
    "23514",
  );
});

test("documents cannot reference a missing Purchase Twin", async () => {
  await rejectedWrite(
    "update documents set twin_id = $1 where id = $2",
    [randomUUID(), demoData.documents[0].id],
    "23503",
  );
});

test("product and merchant identity are constrained together", async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const merchantId = randomUUID();
    await client.query(
      "insert into merchants (id, name) values ($1, 'Integration-only merchant')",
      [merchantId],
    );
    await assert.rejects(
      client.query("update purchase_twins set merchant_id = $1 where id = $2", [
        merchantId,
        demoData.twins[0].id,
      ]),
      { code: "23503" },
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("sample customer schema rejects a real-customer classification", async () => {
  await rejectedWrite(
    "update demo_customers set kind = 'real' where id = $1",
    [CUSTOMER_ID],
    "23514",
  );
});
