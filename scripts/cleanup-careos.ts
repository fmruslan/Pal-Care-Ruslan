import { createDatabase } from "../src/db/connection";
import { databaseUrl } from "./environment";

// Operator-only housekeeping; touches expired CareOS content, never commerce.
const { pool } = createDatabase(databaseUrl());
try {
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
