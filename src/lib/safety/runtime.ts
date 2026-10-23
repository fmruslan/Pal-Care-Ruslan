import "server-only";
import { connection } from "next/server";
import { createDatabase } from "../../db/connection";
import { assertDatabaseAuthority } from "../../db/authority";
import { getEnvironment } from "../config";
import { referenceSource, REVIEWED_SOURCE_HASH } from "./reference";
import { sourceHash, sourceSchema } from "./cpsc";
import type { RecallSnapshot } from "./service";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";
const state = globalThis as unknown as {
  safetyDb?: ReturnType<typeof createDatabase>;
};
export type SafetyView = {
  snapshot: RecallSnapshot;
  mode: "bundled_official_snapshot" | "retrieved_official_snapshot";
  lastAttempt: string | null;
  unavailable: boolean;
};
// Actual bounded retrieval was independently performed during development; not continuous monitoring.
export const bundledSnapshot: RecallSnapshot = {
  source: referenceSource,
  hash: sourceHash(referenceSource),
  retrievedAt: "2026-10-23T05:34:34.139Z",
  endpoint:
    "https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallNumber=24159",
};
export async function getSafety(): Promise<SafetyView> {
  if (sourceHash(referenceSource) !== REVIEWED_SOURCE_HASH)
    throw new Error("Reviewed CPSC snapshot hash mismatch.");
  await connection();
  const config = getEnvironment();
  if (config.dataSource === "fixtures")
    return {
      snapshot: bundledSnapshot,
      mode: "bundled_official_snapshot",
      lastAttempt: null,
      unavailable: false,
    };
  const { pool } = (state.safetyDb ??= createDatabase(config.databaseUrl!, {
    readOnly: true,
  }));
  try {
    await assertDatabaseAuthority(pool, "reader");
    const row = (
      await pool.query(
        "select c.checked_at,c.state,s.hash,s.source,s.retrieved_at,s.endpoint from recall_checks c left join recall_sources s on s.hash=c.source_hash where c.key='reference'",
      )
    ).rows[0];
    if (!row?.hash)
      return {
        snapshot: bundledSnapshot,
        mode: "bundled_official_snapshot",
        lastAttempt: row?.checked_at?.toISOString() ?? null,
        unavailable: row?.state === "unavailable",
      };
    const source = sourceSchema.parse(row.source);
    if (sourceHash(source) !== row.hash) throw new Error();
    return {
      snapshot: {
        source,
        hash: row.hash,
        retrievedAt: row.retrieved_at.toISOString(),
        endpoint: row.endpoint,
      },
      mode: "retrieved_official_snapshot",
      lastAttempt: row.checked_at.toISOString(),
      unavailable: row.state === "unavailable",
    };
  } catch {
    throw new Error(
      "Recall records unavailable. No database error was replaced by fixture data.",
    );
  }
}
export async function getTwinRecallHistory(
  twinId: string,
): Promise<
  { id: string; state: string; reason: string; at: string; hash: string }[]
> {
  const config = getEnvironment();
  if (config.dataSource === "fixtures") return [];
  const { pool } = (state.safetyDb ??= createDatabase(config.databaseUrl!, {
    readOnly: true,
  }));
  const rows = await pool.query(
    "select a.id,a.state,a.reason,a.created_at,a.source_hash from recall_assessments a join purchase_twins t on t.id=a.twin_id where t.id=$1 and t.customer_id=$2 and t.merchant_id=$3 order by a.created_at desc,a.id limit 10",
    [twinId, CUSTOMER_ID, MERCHANT_ID],
  );
  return rows.rows.map((r) => ({
    id: r.id,
    state: r.state,
    reason: r.reason,
    at: r.created_at.toISOString(),
    hash: r.source_hash,
  }));
}
