import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  runtimeGrants,
  runtimeReads,
  type DatabaseCapability,
} from "../../src/db/authority";

/** Disposable REAL logins, only in the explicitly dedicated local test database. */
export async function testRuntimeRoles(url: string) {
  if (
    !URL.canParse(url) ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error("Dedicated TEST_DATABASE_URL required");
  const admin = new Pool({ connectionString: url, max: 1 });
  const roles: string[] = [];
  const urls = {} as Record<DatabaseCapability, string>;
  try {
    const databaseName = new URL(url).pathname.slice(1);
    if (!/^[a-zA-Z0-9_]+$/.test(databaseName))
      throw new Error("Unsupported test database name");
    // PUBLIC grants are additive; absence of a per-login TEMP grant is not enough.
    await admin.query(
      `revoke temporary on database "${databaseName}" from public`,
    );
    const existing = new Set(
      (
        await admin.query(
          "select tablename from pg_tables where schemaname='public'",
        )
      ).rows.map((r) => r.tablename),
    );
    for (const capability of Object.keys(
      runtimeGrants,
    ) as DatabaseCapability[]) {
      const role = `test_${capability}_${randomUUID().replaceAll("-", "")}`,
        password = randomBytes(32).toString("hex");
      await admin.query(
        `create role ${role} login password '${password}' noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls`,
      );
      roles.push(role);
      await admin.query(`grant usage on schema public to ${role}`);
      for (const table of runtimeReads[capability].filter((t) =>
        existing.has(t),
      ))
        await admin.query(`grant select on ${table} to ${role}`);
      for (const [table, grants] of Object.entries(
        runtimeGrants[capability],
      ).filter(([t]) => existing.has(t))) {
        for (const grant of grants) {
          const [privilege, column] = grant.split(":");
          await admin.query(
            `grant ${privilege}${column ? `(${column})` : ""} on ${table} to ${role}`,
          );
        }
      }
      if (capability === "guardian")
        await admin.query(
          `grant usage on sequence guardian_prices_sequence_seq to ${role}`,
        );
      const login = new URL(url);
      login.username = role;
      login.password = password;
      urls[capability] = login.toString();
    }
    return {
      urls,
      async close() {
        for (const role of roles.reverse())
          await admin.query(`drop owned by ${role}; drop role ${role}`);
        await admin.end();
      },
    };
  } catch (error) {
    for (const role of roles.reverse())
      await admin.query(`drop owned by ${role}; drop role ${role}`);
    await admin.end();
    throw error;
  }
}
