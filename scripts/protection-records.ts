// Private worker entry. No dotenv/general owner URL, HTTP, model or finance path.
import { Pool } from "pg";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../src/db/authority";
import { runProtectionChecks } from "../src/lib/care/protection/store";
try {
  if (
    process.env.CARE_PROTECTION_WORKER_ENABLED !== "true" ||
    process.argv[2] !== "check"
  )
    throw Error("protection_worker_scope_required");
  const pool = new Pool({
    connectionString: runtimeWriterUrl("CARE_PROTECTION_DATABASE_URL"),
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 10000,
  });
  try {
    await assertDatabaseAuthority(pool, "protection_worker");
    console.log(JSON.stringify(await runProtectionChecks(pool)));
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    "Protection check stopped; no financial/model request or authority renewal was performed.",
  );
  process.exitCode = 1;
}
