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
