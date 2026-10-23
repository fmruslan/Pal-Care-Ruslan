import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { assertDatabaseAuthority } from "../../src/db/authority";
import "../../scripts/environment";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Dedicated local TEST_DATABASE_URL required");
const { db, pool } = createDatabase(url);
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
after(async () => {
  await pool.end();
});
test("actual reader login rejects column writes, TRUNCATE, assumable writer, ownership and narrowed-owner sessions", async () => {
  const role = `authority_${randomUUID().replaceAll("-", "")}`,
    writer = `${role}_w`,
    password = randomBytes(32).toString("hex");
  await pool.query(
    `create role ${role} login password '${password}' noinherit nosuperuser nocreatedb nocreaterole; create role ${writer} nologin`,
  );
  const login = new URL(url!);
  login.username = role;
  login.password = password;
  const restricted = new Pool({ connectionString: login.toString(), max: 1 });
  const narrowed = new Pool({
    connectionString: url,
    options: `-c role=${role}`,
    max: 1,
  });
  try {
    await pool.query(
      `grant usage on schema public to ${role}; grant select on products to ${role}`,
    );
    await assertDatabaseAuthority(restricted, "reader");
    await assert.rejects(
      restricted.query("update products set price_minor=price_minor"),
      { code: "42501" },
    );
    await assert.rejects(assertDatabaseAuthority(narrowed, "reader"));
    await pool.query(`grant update(price_minor) on products to ${role}`);
    assert.equal(
      (
        await pool.query(
          "select has_table_privilege($1,'products','UPDATE') v",
          [role],
        )
      ).rows[0].v,
      false,
    );
    await assert.rejects(assertDatabaseAuthority(restricted, "reader"));
    await pool.query(
      `revoke update(price_minor) on products from ${role}; grant truncate on products to ${role}`,
    );
    await assert.rejects(assertDatabaseAuthority(restricted, "reader"));
    await pool.query(
      `revoke truncate on products from ${role}; grant update on products to ${writer}; grant ${writer} to ${role} with inherit false,set true`,
    );
    assert.equal(
      (
        await pool.query(
          "select has_table_privilege($1,'products','UPDATE') v",
          [role],
        )
      ).rows[0].v,
      false,
    );
    await assert.rejects(assertDatabaseAuthority(restricted, "reader"));
    await pool.query(
      `revoke ${writer} from ${role}; create table authority_owned_probe(id integer); alter table authority_owned_probe owner to ${role}`,
    );
    await assert.rejects(assertDatabaseAuthority(restricted, "reader"));
    await pool.query("drop table authority_owned_probe");
    await assertDatabaseAuthority(restricted, "reader");
  } finally {
    await restricted.end();
    await narrowed.end();
    await pool.query(
      `drop table if exists authority_owned_probe; drop owned by ${role}; drop owned by ${writer}; drop role ${role}; drop role ${writer}`,
    );
  }
});
