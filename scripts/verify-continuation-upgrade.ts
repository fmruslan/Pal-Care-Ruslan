import { createHash } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrl } from "./environment";
const url = databaseUrl();
if (
  process.argv[2] !== "--apply" ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
  new URL(url).pathname.endsWith("_test")
)
  throw new Error(
    "Explicit existing local app database --apply required, never deployed/test data.",
  );
const { pool, db } = createDatabase(url);
try {
  const tables = (
    await pool.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    )
  ).rows.map((r) => String(r.tablename));
  const snapshot = async () => {
    const client = await pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const hashes = [];
      for (const table of tables) {
        if (!/^[a-z_]+$/.test(table)) throw new Error();
        const result = await client.query(
          `select to_jsonb(t) row from "${table}" t order by to_jsonb(t)::text`,
        );
        hashes.push(
          createHash("sha256")
            .update(JSON.stringify(result.rows))
            .digest("hex"),
        );
      }
      await client.query("commit");
      return hashes;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  const before = await snapshot();
  await migrate(db, { migrationsFolder: "./drizzle" });
  const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error();
  console.log(
    `PASS: all rows across ${tables.length} existing public tables preserved. Reviewed additive migrations only; no seed, price change, grant or financial/provider call.`,
  );
} catch {
  console.error(
    "Upgrade preservation failed. Investigate without resets or financial retries.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
