import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection";
import { databaseFingerprint } from "../src/db/preservation";
import { databaseUrlSchema } from "../src/lib/config";
import "./environment";
if (
  process.argv[2] !== "--apply" ||
  process.env.STAGE5_MIGRATION_APPROVED !== "true"
)
  throw new Error(
    "Requires separate owner approval, STAGE5_MIGRATION_APPROVED=true and --apply; stop application writers first.",
  );
const parsed = databaseUrlSchema.safeParse(process.env.MIGRATION_DATABASE_URL);
if (!parsed.success)
  throw new Error(
    "Explicit valid operator migration connection required; credentials withheld.",
  );
const url = parsed.data;
const { db, pool } = createDatabase(url);
try {
  const before = await databaseFingerprint(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  const after = await databaseFingerprint(pool, Object.keys(before));
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Preservation mismatch");
  console.log(
    `PASS: ${Object.keys(before).length} existing public tables preserved byte-for-byte by canonical row fingerprints; migrations only, no seed/provider calls. Runtime credentials still need separate verification.`,
  );
} catch {
  console.error(
    "Upgrade failed or preservation mismatch. Do not reset, rewrite evidence or retry provider operations.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
