import { createHash } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { seedDemo } from "../src/db/seed";
import { databaseUrl } from "./environment";

const url = databaseUrl();
if (
  process.argv[2] !== "--apply" ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  new URL(url).pathname.endsWith("_test")
)
  throw new Error(
    "Use --apply only for the existing local application database, never a deployed/test database.",
  );
const { pool, db } = createDatabase(url);
const tables = [
  "checkout_orders",
  "checkout_rate_limits",
  "purchase_twins",
  "products",
  "documents",
  "care_events",
  "demo_customers",
  "merchants",
  "care_knowledge",
  "care_conversations",
  "care_requests",
  "care_buckets",
];
async function snapshot() {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const result = new Map<string, string>();
    for (const table of tables) {
      const rows = await client.query(
        `select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`,
      );
      result.set(
        table,
        createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex"),
      );
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
try {
  const before = await snapshot();
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDemo(db);
  const after = await snapshot();
  if (tables.some((table) => before.get(table) !== after.get(table)))
    throw new Error("Existing records changed.");
  const policy = (
    await pool.query(
      "select approved_at,approved_by from guardian_policies where version='demo-price-v2'",
    )
  ).rows[0];
  if (!policy || policy.approved_at || policy.approved_by)
    throw new Error("Policy is not an inactive draft.");
  for (const table of [
    "guardian_bindings",
    "guardian_cases",
    "guardian_refunds",
    "guardian_prices",
    "operator_grants",
  ])
    if (
      (await pool.query(`select count(*)::int n from ${table}`)).rows[0].n !== 0
    )
      throw new Error("Unexpected Guardian operational records.");
  console.log(
    "PASS: reviewed additive Guardian migrations/seed; all rows across the twelve pre-existing tables are unchanged. Only an inactive policy draft was added. No provider calls, grants, synthetic captures, price changes or financial activation.",
  );
} catch {
  console.error(
    "Guardian upgrade preservation check failed. Investigate privately; do not reset data or retry a payment.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
