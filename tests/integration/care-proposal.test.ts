// Proposed DDL is exercised only inside a rollback transaction in a dedicated DB.
import assert from "node:assert/strict";
import {
  readFile,
  mkdtemp,
  mkdir,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import {
  careMigrationBaseline,
  reviewedCareMigration,
  CARE_MIGRATION_FOLDER,
} from "../../scripts/care-migration-plan";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
  runtimeReads,
} from "../../src/db/authority";
import {
  appendManualCare,
  checkDueWatches,
  pauseWatches,
  readSavedCare,
  saveWatch,
} from "../../src/lib/care/store";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
)
  throw Error(
    "Care proposal requires explicit local dedicated TEST_DATABASE_URL ending _test.",
  );

test("Care proposal permits only fixed-scope manual append and watch-check columns, preserving original evidence", async () => {
  const { db, pool: migration } = createDatabase(url);
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    await seedDemo(db);
  } finally {
    await migration.end();
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const schema = `care_proposal_${suffix}`;
  const reader = `care_reader_${suffix}`,
    reporter = `care_reporter_${suffix}`,
    worker = `care_worker_${suffix}`;
  const twin = "00000000-0000-4000-8000-000000000201";
  const caseId = randomUUID(),
    watchId = randomUUID();
  async function denied(sql: string, values: unknown[] = []) {
    await client.query("savepoint expected_denial");
    try {
      await assert.rejects(client.query(sql, values));
    } finally {
      await client.query("rollback to savepoint expected_denial");
    }
  }
  try {
    await client.query("begin");
    const before = (
      await client.query(
        "select row_to_json(t) as row from purchase_twins t order by id",
      )
    ).rows;
    await client.query(
      `create schema ${schema}; set local search_path=${schema},public`,
    );
    const sql = (await readFile("docs/proposals/care-persistence.sql", "utf8"))
      .replace(/^BEGIN;$/m, "")
      .replace(/^COMMIT;$/m, "")
      .replaceAll("palcare_care_reader", reader)
      .replaceAll("palcare_care_reporter", reporter)
      .replaceAll("palcare_care_watch_worker", worker);
    await client.query(sql);
    await client.query(
      `grant usage on schema ${schema} to ${reader},${reporter},${worker}`,
    );
    await client.query(`set local role ${reporter}`);
    await client.query(
      "insert into care_cases(id,twin_id,kind) values($1,$2,'return')",
      [caseId, twin],
    );
    await client.query(
      "insert into care_case_events(id,case_id,twin_id,revision,state,source_reference,effective_on,facts) values($1,$2,$3,1,'received','manual-note',current_date,'{}')",
      [randomUUID(), caseId, twin],
    );
    assert.equal(
      (await client.query("select source_kind from care_case_events")).rows[0]
        .source_kind,
      "manual",
    );
    await denied(
      "insert into care_case_events(id,case_id,twin_id,revision,state,source_kind,source_reference,effective_on,facts) values($1,$2,$3,2,'received','external','fake-provider',current_date,'{}')",
      [randomUUID(), caseId, twin],
    );
    await denied("update care_case_events set state='closed'");
    await denied("delete from care_cases");
    await denied(
      "update purchase_twins set purchase_price_minor=1 where id=$1",
      [twin],
    );
    await client.query(
      "insert into care_watches(id,twin_id,expires_at) values($1,$2,now()+interval '14 days')",
      [watchId, twin],
    );
    assert.equal(
      (await client.query("select state from care_watches")).rows[0].state,
      "saved",
    );
    await denied("update care_watches set state='active'");
    await denied(
      "insert into care_watches(id,twin_id,expires_at) values($1,'00000000-0000-4000-8000-000000000202',now()+interval '14 days')",
      [randomUUID()],
    );
    await client.query("reset role");
    await client.query(`set local role ${worker}`);
    await denied("update care_watches set state='active'");
    await client.query(
      "update care_watches set state='active',last_checked_at=now(),next_check_at=now()+interval '1 day',observed_minor=12900 where id=$1",
      [watchId],
    );
    await denied("update care_watches set expires_at=now()+interval '30 days'");
    await denied("update products set price_minor=1");
    await denied(
      "insert into care_cases(id,twin_id,kind) values($1,$2,'return')",
      [randomUUID(), twin],
    );
    await client.query("reset role");
    await client.query(`set local role ${reader}`);
    assert.equal(
      (await client.query("select count(*)::int as n from care_case_events"))
        .rows[0].n,
      1,
    );
    await denied(
      "insert into care_cases(id,twin_id,kind) values($1,$2,'return')",
      [randomUUID(), twin],
    );
    await client.query("reset role");
    const after = (
      await client.query(
        "select row_to_json(t) as row from purchase_twins t order by id",
      )
    ).rows;
    assert.deepEqual(after, before);
    // Owner-side accidental updates are blocked too; no SECURITY DEFINER bypass.
    await denied("update care_case_events set source_kind='external'");
  } finally {
    await client.query("rollback");
    client.release();
    await pool.end();
  }
});

test("selected Drizzle Care lane applies atomically on 0015, repeats safely, and does not apply or skip deferred API 0016", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
    name = `palcare_lane_${suffix}_test`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const groups = [
    "palcare_care_reader",
    "palcare_care_reporter",
    "palcare_care_watch_worker",
  ];
  assert.equal(
    (
      await admin.query(
        "select count(*)::int as n from pg_roles where rolname=any($1::text[])",
        [groups],
      )
    ).rows[0].n,
    0,
    "Dedicated test cluster must not already contain the proposed groups",
  );
  const folder = await mkdtemp(
    join(
      existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(),
      "care-migration-test-",
    ),
  );
  let database: ReturnType<typeof createDatabase> | undefined;
  let created = false;
  try {
    const journal = JSON.parse(
      await readFile("drizzle/meta/_journal.json", "utf8"),
    );
    journal.entries = journal.entries.slice(0, 16);
    await mkdir(join(folder, "meta"));
    await writeFile(
      join(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries)
      await copyFile(
        `drizzle/${entry.tag}.sql`,
        join(folder, `${entry.tag}.sql`),
      );
    await admin.query(`create database ${name}`);
    const target = new URL(url!);
    target.pathname = `/${name}`;
    database = createDatabase(target.toString());
    await migrate(database.db, { migrationsFolder: folder });
    await seedDemo(database.db);
    const plan = await reviewedCareMigration();
    const history = async () =>
      (
        await database!.pool.query(
          "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
        )
      ).rows;
    assert.equal(careMigrationBaseline(await history(), plan), "pending");
    await migrate(database.db, { migrationsFolder: CARE_MIGRATION_FOLDER });
    created = true;
    assert.equal(careMigrationBaseline(await history(), plan), "applied");
    const rows = await history();
    await migrate(database.db, { migrationsFolder: CARE_MIGRATION_FOLDER });
    assert.deepEqual(await history(), rows);
    assert.equal(
      (
        await database.pool.query(
          "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='care_model_calls' and column_name='usage'",
        )
      ).rows[0].n,
      0,
      "API 0016 was not applied",
    );
    // In the dedicated test ONLY, prove 0016 remains pending rather than being
    // silently marked applied/skipped by the Care lane's ordering metadata.
    await migrate(database.db, { migrationsFolder: "drizzle" });
    assert.equal(
      (
        await database.pool.query(
          "select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='care_model_calls' and column_name='usage'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal((await history()).length, 18);
  } finally {
    if (database) await database.pool.end();
    await admin.query(`drop database if exists ${name}`);
    if (created)
      for (const role of groups) await admin.query(`drop role ${role}`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
});

test("actual restricted Care logins persist manual timelines/warranties and daily pausable watches without original-record changes", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseName = `palcare_care_${suffix}_test`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const databaseUrl = new URL(url!);
  databaseUrl.pathname = `/${databaseName}`;
  const groups = {
    reader: `care_read_${suffix}`,
    reporter: `care_report_${suffix}`,
    worker: `care_work_${suffix}`,
  };
  const logins: string[] = [];
  const pools: Pool[] = [];
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    await admin.query(`create database ${databaseName}`);
    database = createDatabase(databaseUrl.toString());
    await migrate(database.db, { migrationsFolder: "drizzle" });
    await seedDemo(database.db);
    await database.pool.query(
      `revoke temporary on database ${databaseName} from public`,
    );
    const fingerprint = async () =>
      (
        await database!.pool.query(
          "select json_build_object('twins',(select json_agg(t order by id) from purchase_twins t),'documents',(select json_agg(d order by id) from documents d),'events',(select json_agg(e order by id) from care_events e)) as evidence",
        )
      ).rows[0].evidence;
    const original = await fingerprint();
    const oldName = `care_original_reader_${suffix}`,
      oldPassword = randomBytes(24).toString("hex");
    await database.pool.query(
      `create role ${oldName} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${oldPassword}'; grant usage on schema public to ${oldName}; grant select on ${runtimeReads.reader.join(",")} to ${oldName}`,
    );
    logins.push(oldName);
    const oldUrl = new URL(databaseUrl);
    oldUrl.username = oldName;
    oldUrl.password = oldPassword;
    const oldReader = new Pool({ connectionString: oldUrl.toString(), max: 1 });
    pools.push(oldReader);
    await assertDatabaseAuthority(oldReader, "reader");
    const sql = (await readFile("docs/proposals/care-persistence.sql", "utf8"))
      .replaceAll("palcare_care_reader", groups.reader)
      .replaceAll("palcare_care_reporter", groups.reporter)
      .replaceAll("palcare_care_watch_worker", groups.worker);
    await database.pool.query(sql);
    await assertDatabaseAuthority(oldReader, "reader");
    await assertEvidenceGuards(oldReader);
    assert.equal(
      Number(
        (await oldReader.query("select count(*) from purchase_twins")).rows[0]
          .count,
      ),
      4,
    );
    await assert.rejects(oldReader.query("select * from care_cases"));
    async function login(kind: keyof typeof groups) {
      const name = `care_login_${kind}_${suffix}`,
        password = randomBytes(24).toString("hex");
      await database!.pool.query(
        `create role ${name} login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'; grant ${groups[kind]} to ${name}`,
      );
      logins.push(name);
      const value = new URL(databaseUrl);
      value.username = name;
      value.password = password;
      const pool = new Pool({ connectionString: value.toString(), max: 2 });
      pools.push(pool);
      return pool;
    }
    const reader = await login("reader"),
      reporter = await login("reporter"),
      worker = await login("worker");
    await assertDatabaseAuthority(reader, "care_reader");
    await assertDatabaseAuthority(reporter, "care_reporter");
    await assertDatabaseAuthority(worker, "care_worker");
    const twinId = "00000000-0000-4000-8000-000000000201",
      caseId = randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    const first = {
      twinId,
      caseId,
      reference: "reported-preparation",
      effectiveOn: day,
      state: "prepared",
    };
    const event = await appendManualCare(reporter, "return", first);
    assert.equal(
      (await appendManualCare(reporter, "return", first)).id,
      event.id,
    );
    await assert.rejects(
      appendManualCare(reporter, "return", { ...first, state: "closed" }),
      /care_reference_conflict/,
    );
    await appendManualCare(reporter, "return", {
      ...first,
      reference: "reported-shipped",
      state: "shipped",
    });
    await appendManualCare(reporter, "return", {
      ...first,
      reference: "reported-arrival",
      state: "received",
    });
    const expiresOn = new Date(Date.now() + 15 * 86400000)
      .toISOString()
      .slice(0, 10);
    const warranty = {
      twinId,
      caseId: randomUUID(),
      reference: "manual-warranty-date",
      effectiveOn: day,
      expiresOn,
      basis: "Date manually reported; fictional goods have no real coverage",
    };
    const savedWarranty = await appendManualCare(
      reporter,
      "warranty",
      warranty,
    );
    assert.equal(
      (await appendManualCare(reporter, "warranty", warranty)).id,
      savedWarranty.id,
    );
    const watch = await saveWatch(reporter, {
      id: randomUUID(),
      twinId,
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    });
    assert.equal(watch.state, "saved");
    assert.equal((await checkDueWatches(worker)).checked, 1);
    assert.equal((await checkDueWatches(worker)).checked, 0);
    assert.equal(await pauseWatches(worker, true), 1);
    assert.equal((await checkDueWatches(worker)).checked, 0);
    let saved = await readSavedCare(reader);
    assert.deepEqual(
      saved.returns.map((r) => r.state),
      ["prepared", "shipped", "received"],
    );
    assert.equal(saved.warranties[0].expiresOn, expiresOn);
    assert.equal(saved.warranties[0].evidence.kind, "manual");
    assert.equal(saved.watches[0].state, "paused");
    assert.equal(await pauseWatches(worker, false), 1);
    assert.equal(
      (await checkDueWatches(worker)).checked,
      0,
      "Resume must not reset the daily due time",
    );
    for (const pool of [reader, reporter, worker]) {
      await assert.rejects(
        pool.query("update purchase_twins set purchase_price_minor=1"),
      );
      await assert.rejects(pool.query("select * from care_conversations"));
      await assert.rejects(
        pool.query("update guardian_refunds set state='completed'"),
      );
    }
    await assert.rejects(
      worker.query(
        "update care_watches set expires_at=now()+interval '29 days'",
      ),
    );
    await assert.rejects(
      reporter.query("update care_watches set state='active'"),
    );
    await database.pool.query(
      "update care_watches set created_at=now()-interval '15 days',expires_at=now()-interval '1 day',last_checked_at=now()-interval '2 days',next_check_at=now()-interval '1 day'",
    );
    assert.equal((await checkDueWatches(worker)).checked, 1);
    saved = await readSavedCare(reader);
    assert.equal(saved.watches[0].state, "expired");
    assert.deepEqual(await fingerprint(), original);
    await assert.rejects(
      database.pool.query("delete from care_case_events"),
      /append-only/,
    );
  } finally {
    for (const pool of pools) await pool.end();
    if (database) await database.pool.end();
    await admin.query(`drop database if exists ${databaseName}`);
    for (const name of [...logins.reverse(), ...Object.values(groups)])
      await admin.query(`drop role if exists ${name}`);
    await admin.end();
  }
});
