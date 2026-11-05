import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  careMigrationBaseline,
  reviewedCareMigration,
} from "./care-migration-plan";
export const PROTECTION_SQL_HASH =
  "1f9822a8a7a3af58d0b183c483efd4dd8f8e30cbf48420bbb366de8618ef5a10";
export const PROTECTION_MIGRATION_FOLDER = "drizzle/protection";
export const PROTECTION_JOURNAL = "__care_protection_migrations";
export async function reviewedProtectionMigration() {
  const sql = await readFile(
    "docs/proposals/care-price-protection.sql",
    "utf8",
  );
  const versioned = await readFile(
    "drizzle/protection/0018_care_price_protection.sql",
    "utf8",
  );
  const digest = createHash("sha256").update(sql).digest("hex");
  if (digest !== PROTECTION_SQL_HASH || versioned !== sql)
    throw Error("protection_sql_not_exact_approved_version");
  const lane = JSON.parse(
    await readFile("drizzle/protection/meta/_journal.json", "utf8"),
  );
  if (
    lane.entries.length !== 1 ||
    lane.entries[0].tag !== "0018_care_price_protection" ||
    lane.entries[0].when !== 1793836800000
  )
    throw Error("protection_migration_lane_changed");
  return {
    approvedHash: digest,
    order: lane.entries[0].when as number,
    care: await reviewedCareMigration(),
  };
}
export function protectionRootBaseline(
  rows: { hash: string; created_at: string | number }[],
  plan: Awaited<ReturnType<typeof reviewedProtectionMigration>>,
) {
  if (careMigrationBaseline(rows, plan.care) !== "applied")
    throw Error("protection_requires_approved_care_baseline");
}
