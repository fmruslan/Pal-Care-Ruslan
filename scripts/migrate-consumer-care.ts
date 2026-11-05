// Host-only exact approved data lane. No migration authority in the web runtime.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseUrlSchema } from "../src/lib/config";
import {
  CONSUMER_JOURNAL,
  CONSUMER_LANE,
  consumerProposal,
} from "./care-consumer-plan";
import {
  protectionRootBaseline,
  reviewedProtectionMigration,
} from "./protection-migration-plan";

try {
  const proposal = await consumerProposal();
  if (process.argv.includes("--print-proposal"))
    console.log(JSON.stringify(proposal, null, 2));
  else {
    if (
      !process.argv.includes("--apply-approved-consumer") ||
      process.env.APPROVED_CONSUMER_SQL_HASH !== proposal.sqlHash ||
      process.env.APPROVED_CONSUMER_DATA_HASH !== proposal.dataHash
    )
      throw Error("exact_consumer_data_approval_required");
    const database = createDatabase(
      databaseUrlSchema.parse(process.env.MIGRATION_DATABASE_URL),
      { max: 1 },
    );
    try {
      const before = (
        await database.pool.query(
          "select id,hash,created_at from drizzle.__drizzle_migrations order by id",
        )
      ).rows;
      protectionRootBaseline(before, await reviewedProtectionMigration());
      const demo = (
        await database.pool.query(
          "select hash from drizzle.__care_demo_migrations order by id",
        )
      ).rows;
      if (
        demo.length !== 1 ||
        demo[0].hash !==
          "59fa5bdff64b2ee2aab42c368347a46d0a795d001e74fb7dfb260b0fc2f38d60"
      )
        throw Error("approved_ten_product_baseline_required");
      await migrate(database.db, {
        migrationsFolder: CONSUMER_LANE,
        migrationsTable: CONSUMER_JOURNAL,
      });
      const after = (
        await database.pool.query(
          "select id,hash,created_at from drizzle.__drizzle_migrations order by id",
        )
      ).rows;
      if (JSON.stringify(before) !== JSON.stringify(after))
        throw Error("original_journal_changed");
      console.log(
        JSON.stringify({
          consumerDemo: "three-sample-documents-applied",
          ...proposal,
          financialOperations: 0,
        }),
      );
    } finally {
      await database.pool.end();
    }
  }
} catch {
  console.error(
    "Consumer Demo data stopped. Exact approval, reviewed baseline and private operator authority required; no credentials logged.",
  );
  process.exitCode = 1;
}
