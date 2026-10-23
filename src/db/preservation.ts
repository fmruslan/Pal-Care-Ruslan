import { createHash } from "node:crypto";
import type { Pool } from "pg";
export async function databaseFingerprint(pool: Pool, tables?: string[]) {
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const names =
      tables ??
      (
        await client.query(
          "select tablename from pg_tables where schemaname='public' order by tablename",
        )
      ).rows.map((r) => String(r.tablename));
    const result: Record<string, { count: number; sha256: string }> = {};
    for (const name of names) {
      if (!/^[a-z_]+$/.test(name)) throw new Error("Invalid table identity");
      const rows = await client.query(
        `select to_jsonb(t) row from "${name}" t order by to_jsonb(t)::text`,
      );
      result[name] = {
        count: rows.rowCount ?? 0,
        sha256: createHash("sha256")
          .update(JSON.stringify(rows.rows))
          .digest("hex"),
      };
    }
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
