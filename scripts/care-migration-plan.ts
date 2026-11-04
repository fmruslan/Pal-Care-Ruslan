import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const CARE_APPROVED_SQL_HASH =
  "42b332cf5d6ce22483c28669115149ddf76014c809a1be0af17b055b1f3973a7";
export const CARE_MIGRATION_ORDER = 1793061110367;
export const CARE_MIGRATION_FOLDER = "drizzle/care";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const statements = (text: string) =>
  text
    .split("\n")
    .filter(
      (line) =>
        !line.trimStart().startsWith("--") &&
        !/^(BEGIN|COMMIT);$/.test(line.trim()),
    )
    .join("\n")
    .trim();

/** The selected Drizzle lane adds only approved Care DDL, never root 0016. */
export async function reviewedCareMigration() {
  const approved = await readFile(
    "docs/proposals/care-persistence.sql",
    "utf8",
  );
  const versioned = await readFile(
    "drizzle/care/0017_care_persistence.sql",
    "utf8",
  );
  if (
    hash(approved) !== CARE_APPROVED_SQL_HASH ||
    statements(approved) !== statements(versioned)
  )
    throw Error("care_migration_not_exact_approved_sql");
  const root = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  const lane = JSON.parse(
    await readFile("drizzle/care/meta/_journal.json", "utf8"),
  );
  if (
    lane.entries.length !== 1 ||
    lane.entries[0].when !== CARE_MIGRATION_ORDER ||
    lane.entries[0].tag !== "0017_care_persistence" ||
    root.entries[15].when >= CARE_MIGRATION_ORDER ||
    root.entries[16].when <= CARE_MIGRATION_ORDER
  )
    throw Error("care_migration_order_invalid");
  const baseline: { hash: string; created_at: string }[] = [];
  for (const entry of root.entries.slice(0, 16))
    baseline.push({
      hash: hash(await readFile(`drizzle/${entry.tag}.sql`, "utf8")),
      created_at: String(entry.when),
    });
  return {
    baseline,
    careHash: hash(versioned),
    approvedHash: CARE_APPROVED_SQL_HASH,
    order: CARE_MIGRATION_ORDER,
  };
}

export function careMigrationBaseline(
  rows: { hash: string; created_at: string | number }[],
  plan: Awaited<ReturnType<typeof reviewedCareMigration>>,
) {
  const normal = rows.map((row) => ({
    hash: row.hash,
    created_at: String(row.created_at),
  }));
  const original = normal.slice(0, 16);
  if (JSON.stringify(original) !== JSON.stringify(plan.baseline))
    throw Error("care_requires_exact_0015_baseline");
  if (normal.length === 16) return "pending";
  if (
    normal.length === 17 &&
    normal[16].hash === plan.careHash &&
    normal[16].created_at === String(plan.order)
  )
    return "applied";
  throw Error("care_unapproved_or_unexpected_migration_history");
}
