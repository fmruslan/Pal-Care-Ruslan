import { createDatabase } from "../src/db/connection";
import { seedDemo } from "../src/db/seed";
import "./environment";
import { databaseUrlSchema } from "../src/lib/config";

async function main() {
  const parsed = databaseUrlSchema.safeParse(
    process.env.MIGRATION_DATABASE_URL,
  );
  if (!parsed.success)
    throw new Error("Explicit operator MIGRATION_DATABASE_URL required");
  const { db, pool } = createDatabase(parsed.data);
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
