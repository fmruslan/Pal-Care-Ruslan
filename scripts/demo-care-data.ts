// Private operator/test helper. Never import from web code.
import type { PoolClient } from "pg";
import { demoData } from "../src/lib/demo/fixtures";
import {
  tenProductPack,
  withTenProductFixtures,
} from "../src/lib/care/demo/catalog";
import { validateDemoPack } from "../src/lib/care/demo/model";
import { evidenceHash } from "../src/lib/care/protection/model";

const snake = (row: object) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
      value,
    ]),
  );
export function demoCareRows() {
  const expanded = withTenProductFixtures(demoData);
  const pack = validateDemoPack(tenProductPack);
  return {
    products: expanded.products.slice(demoData.products.length).map(snake),
    purchase_twins: expanded.twins.slice(demoData.twins.length).map(snake),
    documents: expanded.documents.slice(demoData.documents.length).map(snake),
    care_demo_packs: [
      {
        id: pack.id,
        version: pack.version,
        as_of: pack.asOf,
        manifest_hash: evidenceHash(pack),
        customer_id: demoData.customer.id,
        merchant_id: demoData.merchant.id,
      },
    ],
    care_demo_evidence: [...pack.references, ...pack.scenarios].map(
      (payload, ordinal) => ({
        id: payload.id,
        pack_id: pack.id,
        ordinal,
        product_id: payload.productId,
        twin_id: "twinId" in payload ? payload.twinId : null,
        document_id: "documentId" in payload ? payload.documentId : null,
        kind: payload.kind,
        provenance:
          payload.kind === "retail-reference"
            ? "retail-reference"
            : "simulated",
        payload,
        content_hash: evidenceHash(payload),
      }),
    ),
  };
}

/** Caller owns transaction/advisory lock. Collisions are errors, never upserts. */
export async function insertDemoCareRows(client: PoolClient) {
  const rows = demoCareRows();
  for (const [table, records] of Object.entries(rows)) {
    for (const record of records) {
      const columns = Object.keys(record).join(",");
      await client.query(
        `insert into ${table} (${columns}) select ${columns} from jsonb_populate_record(null::${table},$1::jsonb) on conflict(id) do nothing`,
        [JSON.stringify(record)],
      );
      const match = await client.query(
        `select (to_jsonb(t)-$3::text[])=(to_jsonb(jsonb_populate_record(null::${table},$2::jsonb))-$3::text[]) same from ${table} t where t.id=$1`,
        [
          record.id,
          JSON.stringify(record),
          table === "care_demo_packs"
            ? ["created_at"]
            : table === "care_demo_evidence"
              ? ["recorded_at"]
              : [],
        ],
      );
      if (match.rowCount !== 1 || match.rows[0].same !== true)
        throw Error("demo_seed_identity_conflict");
    }
  }
  return Object.fromEntries(
    Object.entries(rows).map(([table, records]) => [table, records.length]),
  );
}
