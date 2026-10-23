import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import "./environment";
import { databaseUrlSchema } from "../src/lib/config";

async function main() {
  const parsed = databaseUrlSchema.safeParse(
    process.env.MIGRATION_DATABASE_URL,
  );
  if (!parsed.success)
    throw new Error("Explicit operator MIGRATION_DATABASE_URL required.");
  const { db, pool } = createDatabase(parsed.data);
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
