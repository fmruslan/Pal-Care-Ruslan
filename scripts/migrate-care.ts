// Private operator-only migration. Never loaded by the web/worker environment.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrlSchema } from "../src/lib/config";
import {
  careMigrationBaseline,
  CARE_MIGRATION_FOLDER,
  reviewedCareMigration,
} from "./care-migration-plan";

try {
  if (!process.argv.includes("--apply-approved-care"))
    throw Error("care_exact_apply_flag_required");
  const url = databaseUrlSchema.parse(process.env.MIGRATION_DATABASE_URL);
  const plan = await reviewedCareMigration();
  const { db, pool } = createDatabase(url);
  try {
    const history = await pool.query(
      "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
    );
    const state = careMigrationBaseline(history.rows, plan);
    if (state === "pending")
      await migrate(db, { migrationsFolder: CARE_MIGRATION_FOLDER });
    careMigrationBaseline(
      (
        await pool.query(
          "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
        )
      ).rows,
      plan,
    );
    console.log(
      JSON.stringify({
        careMigration: "applied",
        repeated: state === "applied",
        approvedSqlHash: plan.approvedHash,
        api0016: "not_applied",
      }),
    );
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    "Care migration stopped. Exact SQL, baseline history and private operator authority are required; no credential values were logged.",
  );
  process.exitCode = 1;
}
