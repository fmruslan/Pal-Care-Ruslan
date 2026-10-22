import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrl } from "./environment";

async function main() {
  const { db, pool } = createDatabase(databaseUrl());
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check database access and reviewed migrations; credentials were not logged.",
  );
  process.exitCode = 1;
});
