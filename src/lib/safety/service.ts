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
export async function saveRecall(pool: Pool, snapshot: RecallSnapshot) {
  if (
    snapshot.endpoint !== CPSC_ENDPOINT ||
    !Number.isFinite(Date.parse(snapshot.retrievedAt)) ||
    Date.parse(snapshot.retrievedAt) > Date.now() + 300000
  )
    throw new Error("cpsc_snapshot_invalid");
  if (sourceHash(snapshot.source) !== snapshot.hash)
    throw new Error("cpsc_hash_mismatch");
  return transaction(pool, async (client) => {
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
    // Only saved immutable sandbox snapshot identity; never infer physical serial verification.
    const rows = await client.query(
      "select id,product_snapshot from purchase_twins where customer_id=$1 and merchant_id=$2 and origin='sandbox' order by id limit 100",
      [CUSTOMER_ID, MERCHANT_ID],
    );
    for (const r of rows.rows) {
      const identity = r.product_snapshot;
      if (!identity) continue;
      const decision = assess(
        { ...identity, identifiersVerified: false },
        snapshot.hash,
      );
      await client.query(
        "insert into recall_assessments(id,twin_id,source_hash,engine_version,state,reason) values(gen_random_uuid(),$1,$2,$3,$4,$5) on conflict(twin_id,source_hash,engine_version) do nothing",
        [r.id, snapshot.hash, ENGINE, decision.state, decision.reason],
      );
    }
    await client.query(
      "insert into recall_checks(key,checked_at,state,source_hash) values('reference',$1,'available',$2) on conflict(key) do update set checked_at=excluded.checked_at,state=excluded.state,source_hash=excluded.source_hash",
      [snapshot.retrievedAt, snapshot.hash],
    );
    return { assessed: rows.rowCount ?? 0 };
  });
}
export async function markRecallUnavailable(pool: Pool) {
  await pool.query(
    "insert into recall_checks(key,checked_at,state) values('reference',now(),'unavailable') on conflict(key) do update set checked_at=excluded.checked_at,state='unavailable'",
  );
}
