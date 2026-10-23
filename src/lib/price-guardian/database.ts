import type { Pool, PoolClient } from "pg";
import { GuardianError } from "./contracts";

export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await work(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function counter(
  client: PoolClient,
  scope: string,
  amount: number,
  limit: number,
) {
  if (amount < 1 || amount > limit)
    throw new GuardianError("guardian_limit", 429);
  const result = await client.query(
    "insert into guardian_counters(key,amount) values($1,$2) on conflict(key) do update set amount=guardian_counters.amount+excluded.amount where guardian_counters.amount+excluded.amount <= $3 returning key",
    [scope, amount, limit],
  );
  if (!result.rowCount) throw new GuardianError("guardian_limit", 429);
}
export async function event(
  client: PoolClient,
  key: string,
  caseId: string | null,
  kind: string,
  actor: string,
  detail: string,
  refundId: string | null = null,
) {
  await client.query(
    "insert into guardian_events(id,dedup_key,case_id,kind,actor,detail,refund_operation_id) values(gen_random_uuid(),$1,$2,$3,$4,$5,$6) on conflict(dedup_key) do nothing",
    [key, caseId, kind, actor, detail, refundId],
  );
}
