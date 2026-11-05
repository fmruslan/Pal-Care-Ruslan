import type { Pool } from "pg";
import { tenProductPack } from "./catalog";
import { validateDemoPack } from "./model";
import { evidenceHash } from "../protection/model";

export async function readDemoCarePack(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const packs = await client.query(
      "select id,version,as_of,manifest_hash from care_demo_packs where id=$1",
      [tenProductPack.id],
    );
    const rows = await client.query(
      "select id,payload,content_hash from care_demo_evidence where pack_id=$1 order by ordinal limit 201",
      [tenProductPack.id],
    );
    const row = packs.rows[0];
    if (packs.rowCount !== 1 || rows.rowCount !== 20 || !row)
      throw Error("demo_pack_missing");
    for (const evidence of rows.rows) {
      if (
        evidenceHash(evidence.payload) !== evidence.content_hash ||
        evidence.payload.id !== evidence.id
      )
        throw Error("demo_evidence_changed");
    }
    const pack = validateDemoPack({
      id: row.id,
      version: row.version,
      asOf: new Date(row.as_of).toISOString(),
      references: rows.rows
        .filter((r) => r.payload.kind === "retail-reference")
        .map((r) => r.payload),
      scenarios: rows.rows
        .filter((r) => r.payload.kind !== "retail-reference")
        .map((r) => r.payload),
    });
    if (
      row.manifest_hash !== evidenceHash(pack) ||
      evidenceHash(pack) !== evidenceHash(validateDemoPack(tenProductPack))
    )
      throw Error("demo_manifest_changed");
    await client.query("commit");
    return pack;
  } catch {
    await client.query("rollback");
    throw Error(
      "Demo Care evidence is unavailable. No fixture fallback was used.",
    );
  } finally {
    client.release();
  }
}
