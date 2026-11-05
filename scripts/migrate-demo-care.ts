// Prepared, not authorized by invocation flags alone. No runtime writer/seed route.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrlSchema } from "../src/lib/config";
import { evidenceHash } from "../src/lib/care/protection/model";
import { demoCareRows, insertDemoCareRows } from "./demo-care-data";
import {
  protectionRootBaseline,
  reviewedProtectionMigration,
} from "./protection-migration-plan";

async function main() {
  const sql = await readFile(
    "drizzle/demo-care/0019_ten_product_demo.sql",
    "utf8",
  );
  const sqlHash = createHash("sha256").update(sql).digest("hex");
  const dataHash = evidenceHash(demoCareRows());
  if (process.argv.includes("--print-proposal")) {
    const digestFile = async (name: string) =>
      createHash("sha256")
        .update(await readFile(name))
        .digest("hex");
    console.log(
      JSON.stringify(
        {
          sqlHash,
          dataHash,
          grantsHash: await digestFile("docs/proposals/ten-product-reader.sql"),
          operatorHash: await digestFile("scripts/migrate-demo-care.ts"),
          seedHelperHash: await digestFile("scripts/demo-care-data.ts"),
          rows: Object.fromEntries(
            Object.entries(demoCareRows()).map(([k, v]) => [k, v.length]),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    !process.argv.includes("--apply-approved-demo") ||
    process.env.APPROVED_DEMO_SQL_HASH !== sqlHash ||
    process.env.APPROVED_DEMO_DATA_HASH !== dataHash
  )
    throw Error("exact_demo_approval_required");
  const database = createDatabase(
    databaseUrlSchema.parse(process.env.MIGRATION_DATABASE_URL),
    { max: 1 },
  );
  const client = await database.pool.connect();
  let released = false;
  try {
    await client.query("select pg_advisory_lock(742019)");
    const before = await client.query(
      "select id,hash,created_at from drizzle.__drizzle_migrations order by id",
    );
    protectionRootBaseline(before.rows, await reviewedProtectionMigration());
    const protection = await client.query(
      "select hash from drizzle.__care_protection_migrations order by id",
    );
    if (
      protection.rowCount !== 1 ||
      protection.rows[0].hash !==
        (await reviewedProtectionMigration()).approvedHash
    )
      throw Error("protection_baseline_required");
    // Standard Drizzle migration transaction; separate lane never skips root 0016.
    client.release();
    released = true;
    await migrate(database.db, {
      migrationsFolder: "drizzle/demo-care",
      migrationsTable: "__care_demo_migrations",
    });
    const writer = await database.pool.connect();
    try {
      await writer.query("begin");
      const counts = await insertDemoCareRows(writer);
      const after = await writer.query(
        "select id,hash,created_at from drizzle.__drizzle_migrations order by id",
      );
      if (JSON.stringify(before.rows) !== JSON.stringify(after.rows))
        throw Error("root_journal_changed");
      await writer.query("commit");
      console.log(
        JSON.stringify({
          demo: "applied",
          sqlHash,
          dataHash,
          counts,
          credentials: "not provisioned",
        }),
      );
    } catch (error) {
      await writer.query("rollback");
      throw error;
    } finally {
      await writer.query("select pg_advisory_unlock(742019)");
      writer.release();
    }
  } finally {
    if (!released) {
      await client.query("select pg_advisory_unlock(742019)");
      client.release();
    }
    await database.pool.end();
  }
}
main().catch(() => {
  console.error(
    "Demo migration stopped. Exact approved hashes, reviewed baseline and private operator authority are required. No credentials logged.",
  );
  process.exitCode = 1;
});
