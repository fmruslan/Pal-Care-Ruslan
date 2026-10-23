import { createDatabase } from "../src/db/connection";
import "./environment";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../src/db/authority";

// Operator-only housekeeping; touches expired CareOS content, never commerce.
const { pool } = createDatabase(runtimeWriterUrl("CAREOS_DATABASE_URL"));
try {
  await assertDatabaseAuthority(pool, "careos");
  const result = await pool.query(
    "delete from care_conversations where expires_at < now() and (pending_until is null or pending_until < now())",
  );
  // Historical budgets survive transcript deletion; no paid-limit reset.
  console.log(
    `Deleted ${result.rowCount} expired CareOS conversations. Spending counters retained.`,
  );
} catch {
  console.error("CareOS cleanup failed; check server configuration.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
