import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { consumerDemoDocuments } from "../src/lib/care/demo/consumer-evidence";

export const CONSUMER_LANE = "drizzle/consumer-care";
export const CONSUMER_JOURNAL = "__care_consumer_migrations";
export function consumerScenarioSql() {
  const rows = consumerDemoDocuments.map((d) => ({
    id: d.id,
    twin_id: d.twinId,
    kind: d.kind,
    origin: d.origin,
    title: d.title,
    content: d.content,
  }));
  const payload = JSON.stringify(rows);
  if (payload.includes("$care_consumer$")) throw Error("unsafe_sql_delimiter");
  return `-- Additive fictional scenario documents only. No payment or original-row changes.\nDO $care_consumer$\nDECLARE expected jsonb := '${payload.replaceAll("'", "''")}'::jsonb; r jsonb;\nBEGIN\n  FOR r IN SELECT value FROM jsonb_array_elements(expected) LOOP\n    IF NOT EXISTS (SELECT 1 FROM purchase_twins t WHERE t.id=(r->>'twin_id')::uuid AND t.origin='sample' AND t.customer_id='00000000-0000-4000-8000-000000000001' AND t.merchant_id='00000000-0000-4000-8000-000000000002') THEN\n      RAISE EXCEPTION 'consumer_demo_sample_binding_required';\n    END IF;\n    INSERT INTO documents(id,twin_id,kind,origin,title,content) SELECT id,twin_id,kind,origin,title,content FROM jsonb_populate_record(null::documents,r) ON CONFLICT(id) DO NOTHING;\n    IF NOT EXISTS (SELECT 1 FROM documents d WHERE d.id=(r->>'id')::uuid AND to_jsonb(d)=to_jsonb(jsonb_populate_record(null::documents,r))) THEN\n      RAISE EXCEPTION 'consumer_demo_document_conflict';\n    END IF;\n  END LOOP;\nEND $care_consumer$;\n`;
}
export async function consumerProposal() {
  const sql = await readFile(
    `${CONSUMER_LANE}/0020_consumer_demo_documents.sql`,
    "utf8",
  );
  if (sql !== consumerScenarioSql())
    throw Error("consumer_demo_sql_manifest_mismatch");
  const digest = (v: string | Buffer) =>
    createHash("sha256").update(v).digest("hex");
  return {
    sqlHash: digest(sql),
    dataHash: digest(JSON.stringify(consumerDemoDocuments)),
    operatorHash: digest(await readFile("scripts/migrate-consumer-care.ts")),
    planHash: digest(await readFile("scripts/care-consumer-plan.ts")),
    counts: { documents: 3, newTables: 0, newCredentials: 0, workers: 0 },
  };
}
