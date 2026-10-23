import type { Pool } from "pg";
import { CPSC_ENDPOINT, sourceHash, type retrieveCpsc } from "./cpsc";
import { REVIEWED_SOURCE_HASH, reviewedModels } from "./reference";
import {
  matchRecall,
  type RecallIdentity,
  type RecallDecision,
} from "./matching";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";
import { transaction } from "../price-guardian/database";
export type RecallSnapshot = Awaited<ReturnType<typeof retrieveCpsc>>;
export const ENGINE = "cpsc-exact-v1";
export function assess(
  identity: RecallIdentity,
  sourceDigest: string,
): RecallDecision {
  return matchRecall(identity, {
    brand: "Insignia",
    models: reviewedModels,
    restrictionsReviewed: true,
    requiresSerial: false,
    requiresDate: false,
    sourceUnchanged: sourceDigest === REVIEWED_SOURCE_HASH,
  });
}
export async function saveRecall(
  pool: Pool,
  snapshot: RecallSnapshot,
  limits: { batchSize?: number; maxBatches?: number } = {},
) {
  const batchSize = limits.batchSize ?? 100,
    maxBatches = limits.maxBatches ?? 20;
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 100 ||
    !Number.isInteger(maxBatches) ||
    maxBatches < 1 ||
    maxBatches > 20
  )
    throw new Error("Invalid recall batch limits");
  if (
    snapshot.endpoint !== CPSC_ENDPOINT ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
    Date.parse(snapshot.retrievedAt) > Date.now() + 300000
  )
    throw new Error("cpsc_snapshot_invalid");
  if (sourceHash(snapshot.source) !== snapshot.hash)
    throw new Error("cpsc_hash_mismatch");
  await transaction(pool, async (client) => {
    await client.query(
      "select pg_advisory_xact_lock(hashtext('cpsc-refresh'))",
    );
    await client.query(
      "insert into recall_sources(hash,recall_number,source,retrieved_at,endpoint) values($1,$2,$3,$4,$5) on conflict(hash) do nothing",
      [
        snapshot.hash,
        snapshot.source.RecallNumber,
        JSON.stringify(snapshot.source),
        snapshot.retrievedAt,
        snapshot.endpoint,
      ],
    );
    await client.query(
      "insert into recall_checks(key,checked_at,state,source_hash) values('reference',$1,'available',$2) on conflict(key) do update set checked_at=excluded.checked_at,state=excluded.state,source_hash=excluded.source_hash",
      [snapshot.retrievedAt, snapshot.hash],
    );
  });
  let assessed = 0;
  // Each batch commits independently. The unique pending-work predicate resumes
  // after interruption and also picks up newly inserted UUIDs behind an old cursor.
  for (let batch = 0; batch < maxBatches; batch++) {
    const count = await transaction(pool, async (client) => {
      await client.query(
        "select pg_advisory_xact_lock(hashtext('cpsc-refresh'))",
      );
      const rows = await client.query(
        "select t.id,t.product_snapshot from purchase_twins t where t.customer_id=$1 and t.merchant_id=$2 and t.origin='sandbox' and not exists(select 1 from recall_assessments a where a.twin_id=t.id and a.source_hash=$3 and a.engine_version=$4) order by t.id limit $5",
        [CUSTOMER_ID, MERCHANT_ID, snapshot.hash, ENGINE, batchSize],
      );
      for (const r of rows.rows) {
        const decision = assess(
          { ...r.product_snapshot, identifiersVerified: false },
          snapshot.hash,
        );
        await client.query(
          "insert into recall_assessments(id,twin_id,source_hash,engine_version,state,reason) values(gen_random_uuid(),$1,$2,$3,$4,$5) on conflict(twin_id,source_hash,engine_version) do nothing",
          [r.id, snapshot.hash, ENGINE, decision.state, decision.reason],
        );
      }
      return rows.rowCount ?? 0;
    });
    assessed += count;
    if (count < batchSize) break;
  }
  const pending = await pool.query(
    "select exists(select 1 from purchase_twins t where t.customer_id=$1 and t.merchant_id=$2 and t.origin='sandbox' and not exists(select 1 from recall_assessments a where a.twin_id=t.id and a.source_hash=$3 and a.engine_version=$4)) remaining",
    [CUSTOMER_ID, MERCHANT_ID, snapshot.hash, ENGINE],
  );
  return { assessed, remaining: pending.rows[0].remaining as boolean };
}
export async function markRecallUnavailable(pool: Pool) {
  await pool.query(
    "insert into recall_checks(key,checked_at,state) values('reference',now(),'unavailable') on conflict(key) do update set checked_at=excluded.checked_at,state='unavailable'",
  );
}
