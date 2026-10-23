import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { databaseUrlSchema } from "../lib/config";

export function createDatabase(
  connectionString: string,
  { readOnly = false, max = 5 }: { readOnly?: boolean; max?: number } = {},
) {
  if (!databaseUrlSchema.safeParse(connectionString).success) {
    throw new Error("A valid PostgreSQL DATABASE_URL is required.");
  }
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    statement_timeout: 5_000,
    query_timeout: 6_000,
    application_name: "palcare-foundation",
    options: readOnly ? "-c default_transaction_read_only=on" : undefined,
  });
  pool.on("error", () => console.error("Database connection interrupted."));
  return { db: drizzle(pool), pool };
}
