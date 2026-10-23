import { createHash } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { seedDemo } from "../src/db/seed";
import { databaseUrl } from "./environment";

// Explicit, local-only additive upgrade. Never runs on app startup or in tests.
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
] as const;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot() {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const data = new Map<string, Map<string, string>>();
    for (const table of tables) {
      const key = table === "checkout_rate_limits" ? "key" : "id";
      const rows = await client.query(
        `select ${key} as key, to_jsonb(t) as value from ${table} t order by ${key}`,
      );
      data.set(
        table,
        new Map(rows.rows.map((row) => [String(row.key), hash(row.value)])),
      );
    }
    await client.query("commit");
    return data;
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
  for (const table of tables)
    for (const [id, digest] of before.get(table)!)
      if (after.get(table)?.get(id) !== digest)
        throw new Error(
          "Existing record changed; investigate without resetting data.",
        );
  console.log(
    "PASS: reviewed versioned CareOS migrations applied; every pre-existing row in all eight foundation/commerce tables is unchanged. Only additive reference/knowledge records were seeded. No provider calls made.",
  );
} catch {
  console.error(
    "CareOS local upgrade verification failed. Investigate privately; no reset or payment retry is authorized.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
