import { createDatabase } from "../src/db/connection";
import { seedDemo } from "../src/db/seed";
import { databaseUrl } from "./environment";

async function main() {
  const { db, pool } = createDatabase(databaseUrl());
  try {
    await seedDemo(db);
    console.log("Fictional sample records seeded (idempotent; no payments). ");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Seed failed. Check database access and migrations; credentials were not logged.",
  );
  process.exitCode = 1;
});
