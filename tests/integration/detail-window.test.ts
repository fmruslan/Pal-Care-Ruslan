import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { readDemoData } from "../../src/db/read-demo";
import { seedDemo } from "../../src/db/seed";
import { demoData } from "../../src/lib/demo/fixtures";
import "../../scripts/environment";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Dedicated local TEST_DATABASE_URL required");
const { db, pool } = createDatabase(url);
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
});
after(async () => {
  await pool.end();
});
test("old Twin and document remain accessible beyond the 100-Twin list window", async () => {
  const ids = Array.from({ length: 105 }, () => randomUUID());
  const target = demoData.twins[0];
  try {
    await pool.query(
      "insert into purchase_twins(id,customer_id,merchant_id,product_id,purchased_on,purchase_price_minor,currency,origin,created_at) select id,$2,$3,$4,'2026-10-23',12900,'USD','sample',now()+interval '1 day' from unnest($1::uuid[]) id",
      [ids, target.customerId, target.merchantId, target.productId],
    );
    assert.equal(
      (await readDemoData(db)).twins.some((t) => t.id === target.id),
      false,
    );
    const detail = await readDemoData(db, { twinId: target.id });
    assert.equal(detail.twins.length, 1);
    assert.equal(detail.twins[0].id, target.id);
    const doc = detail.documents.find((d) => d.kind === "receipt")!;
    assert.ok(doc);
    assert.equal(
      (await readDemoData(db, { documentId: doc.id })).twins[0].id,
      target.id,
    );
    assert.equal(
      (await readDemoData(db, { twinId: randomUUID() })).twins.length,
      0,
    );
  } finally {
    await pool.query("delete from purchase_twins where id=any($1::uuid[])", [
      ids,
    ]);
  }
});
