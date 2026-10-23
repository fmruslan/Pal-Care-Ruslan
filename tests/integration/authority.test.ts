import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
  runtimeReads,
} from "../../src/db/authority";
import { testRuntimeRoles } from "../helpers/runtime-roles";
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
  const name = new URL(url!).pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(name))
    throw new Error("Invalid dedicated DB name");
  await pool.query(`revoke temporary on database "${name}" from public`);
});

test("positive readiness detects missing grants and enabled-feature schema without write probes", async () => {
  const roles = await testRuntimeRoles(url!);
  const reader = new Pool({ connectionString: roles.urls.reader, max: 1 });
  const careos = new Pool({ connectionString: roles.urls.careos, max: 1 });
  const readerName = new URL(roles.urls.reader).username;
  try {
    await assertDatabaseAuthority(reader, "reader");
    await assertEvidenceGuards(reader);
    await pool.query(
      "alter table checkout_orders disable trigger checkout_terminal_evidence_guard",
    );
    try {
      await assert.rejects(assertEvidenceGuards(reader));
    } finally {
      await pool.query(
        "alter table checkout_orders enable trigger checkout_terminal_evidence_guard",
      );
    }
    await assertDatabaseAuthority(careos, "careos");
    await pool.query(`revoke select on recall_assessments from ${readerName}`);
    await assert.rejects(assertDatabaseAuthority(reader, "reader"));
    await pool.query(`grant select on recall_assessments to ${readerName}`);
    await pool.query(
      "alter table care_model_calls rename to care_model_calls_unavailable",
    );
    try {
      await assert.rejects(assertDatabaseAuthority(careos, "careos"));
    } finally {
      await pool.query(
        "alter table care_model_calls_unavailable rename to care_model_calls",
      );
    }
    await assertDatabaseAuthority(careos, "careos");
    await assert.rejects(
      reader.query("create temporary table forbidden_probe(id integer)"),
      { code: "42501" },
    );
  } finally {
    await reader.end();
    await careos.end();
    await roles.close();
  }
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
      `grant usage on schema public to ${role}; grant select on ${runtimeReads.reader.join(",")} to ${role}`,
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
