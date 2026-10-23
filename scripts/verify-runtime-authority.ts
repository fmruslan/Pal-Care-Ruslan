import "./environment";
import { createDatabase } from "../src/db/connection";
import {
  assertDatabaseAuthority,
  runtimeWriterUrl,
  type DatabaseCapability,
} from "../src/db/authority";
const names: [DatabaseCapability, string][] = [
  ["reader", "DATABASE_URL"],
  ["careos", "CAREOS_DATABASE_URL"],
  ["checkout", "CHECKOUT_DATABASE_URL"],
  ["guardian", "GUARDIAN_DATABASE_URL"],
  ["discovery", "DISCOVERY_DATABASE_URL"],
];
let failed = false;
for (const [capability, name] of names) {
  if (!process.env[name]) {
    console.log(`${capability}: NOT CONFIGURED`);
    continue;
  }
  const { pool } = createDatabase(runtimeWriterUrl(name), { readOnly: true });
  try {
    await assertDatabaseAuthority(pool, capability);
    console.log(
      `${capability}: PASS actual login, effective/assumable roles, ownership and write grants (read-only inspection)`,
    );
  } catch {
    failed = true;
    console.log(
      `${capability}: BLOCKED unsafe or unavailable actual authority; no credentials printed`,
    );
  } finally {
    await pool.end();
  }
}
if (failed) process.exitCode = 2;
