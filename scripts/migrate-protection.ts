// Private, owner-approved selected lane only. Never import into web/worker code.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrlSchema } from "../src/lib/config";
import {
  PROTECTION_JOURNAL,
  PROTECTION_MIGRATION_FOLDER,
  protectionRootBaseline,
  reviewedProtectionMigration,
} from "./protection-migration-plan";
try {
  if (!process.argv.includes("--apply-approved-protection"))
    throw Error("protection_apply_flag_required");
  const plan = await reviewedProtectionMigration();
  const { db, pool } = createDatabase(
    databaseUrlSchema.parse(process.env.MIGRATION_DATABASE_URL),
  );
  try {
    const before = (
      await pool.query(
        "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
      )
    ).rows;
    protectionRootBaseline(before, plan);
    // Separate standard Drizzle bookkeeping leaves deferred root 0016 pending.
    await migrate(db, {
      migrationsFolder: PROTECTION_MIGRATION_FOLDER,
      migrationsTable: PROTECTION_JOURNAL,
    });
    const history = (
      await pool.query(
        "select hash,created_at from drizzle.__care_protection_migrations order by id",
      )
    ).rows;
    if (
      history.length !== 1 ||
      history[0].hash !== plan.approvedHash ||
      String(history[0].created_at) !== String(plan.order)
    )
      throw Error("protection_history_mismatch");
    const after = (
      await pool.query(
        "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
      )
    ).rows;
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw Error("root_migration_history_changed");
    console.log(
      JSON.stringify({
        protectionMigration: "applied",
        approvedSqlHash: plan.approvedHash,
        api0016: "not_applied",
        journal: PROTECTION_JOURNAL,
      }),
    );
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    "Protection migration stopped. Exact approval, baseline and private administrator authority are required; no credentials logged.",
  );
  process.exitCode = 1;
}
