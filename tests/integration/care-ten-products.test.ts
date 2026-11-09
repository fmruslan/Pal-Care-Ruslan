import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import {
  mkdtemp,
  readFile,
  mkdir,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import { demoCareRows, insertDemoCareRows } from "../../scripts/demo-care-data";
import { readDemoCarePack } from "../../src/lib/care/demo/store";
import { assertDatabaseAuthority } from "../../src/db/authority";
import { readDemoData } from "../../src/db/read-demo";
import { careFeed } from "../../src/lib/care/model";
import { careProductCards } from "../../src/lib/care/summary";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { CheckoutService } from "../../src/lib/commerce/service";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import { demoCareBrowserJourney } from "../helpers/demo-care-browser-journey";
import {
  consumerDemoDocuments,
  assertConsumerDemoDocuments,
} from "../../src/lib/care/demo/consumer-evidence";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw Error(
    "Explicit dedicated local TEST_DATABASE_URL ending _test required",
  );

test("selected demo lane and atomic seed repeat; actual restricted reader drives Care/North without altering original histories", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const name = `demo_care_${suffix}_test`;
  const role = `demo_care_read_${suffix}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const target = new URL(url);
  target.pathname = `/${name}`;
  await mkdir("/tmp/opencode", { recursive: true });
  const folder = await mkdtemp("/tmp/opencode/demo-care-lane-");
  let database: ReturnType<typeof createDatabase> | undefined;
  let reader: Pool | undefined;
  let created = false,
    createdRole = false;
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
    created = true;
    database = createDatabase(target.toString());
    await migrate(database.db, { migrationsFolder: folder });
    await seedDemo(database.db);
    const before = (
      await database.pool.query(
        "select jsonb_agg(to_jsonb(t) order by id) rows from purchase_twins t",
      )
    ).rows[0].rows;
    const history = (
      await database.pool.query(
        "select hash,created_at from drizzle.__drizzle_migrations order by id",
      )
    ).rows;
    await migrate(database.db, {
      migrationsFolder: "drizzle/demo-care",
      migrationsTable: "__care_demo_migrations",
    });
    await migrate(database.db, {
      migrationsFolder: "drizzle/demo-care",
      migrationsTable: "__care_demo_migrations",
    });
    const client = await database.pool.connect();
    try {
      await client.query("begin");
      const collision = {
        ...demoCareRows().products[0],
        name: "Existing conflicting identity",
      };
      await client.query(
        "insert into products select * from jsonb_populate_record(null::products,$1::jsonb)",
        [JSON.stringify(collision)],
      );
      await assert.rejects(
        insertDemoCareRows(client),
        /demo_seed_identity_conflict/,
      );
      await client.query("rollback");
      assert.equal(
        (await client.query("select count(*)::int n from purchase_twins"))
          .rows[0].n,
        4,
      );
      await client.query("begin");
      assert.deepEqual(await insertDemoCareRows(client), {
        products: 6,
        purchase_twins: 6,
        documents: 16,
        care_demo_packs: 1,
        care_demo_evidence: 20,
      });
      await insertDemoCareRows(client);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    assert.deepEqual(
      (
        await database.pool.query(
          "select hash,created_at from drizzle.__drizzle_migrations order by id",
        )
      ).rows,
      history,
    );
    const after = (
      await database.pool.query(
        "select jsonb_agg(to_jsonb(t) order by id) rows from purchase_twins t where id=any($1::uuid[])",
        [before.map((t: { id: string }) => t.id)],
      )
    ).rows[0].rows;
    assert.deepEqual(after, before);
    assert.equal(
      (await database.pool.query("select count(*)::int n from purchase_twins"))
        .rows[0].n,
      10,
    );
    await assert.rejects(
      database.pool.query(
        "update care_demo_evidence set content_hash=repeat('0',64)",
      ),
      /demo_evidence_immutable/,
    );
    await assert.rejects(
      database.pool.query("delete from care_demo_packs"),
      /demo_evidence_immutable/,
    );
    const pass = randomBytes(24).toString("hex");
    await admin.query(
      `create role ${role} login password '${pass}' nosuperuser nocreatedb nocreaterole noinherit`,
    );
    createdRole = true;
    await database.pool.query(`revoke all on database ${name} from public`);
    await database.pool.query(`grant connect on database ${name} to ${role}`);
    await database.pool.query(`grant usage on schema public to ${role}`);
    await database.pool.query(
      `grant select on care_demo_packs,care_demo_evidence to ${role}`,
    );
    const restricted = new URL(target);
    restricted.username = role;
    restricted.password = pass;
    reader = new Pool({ connectionString: restricted.toString(), max: 1 });
    await assertDatabaseAuthority(reader, "demo_care_reader");
    await assert.rejects(
      reader.query("select * from checkout_orders"),
      /permission denied/,
    );
    await assert.rejects(
      reader.query("update care_demo_evidence set content_hash=repeat('0',64)"),
      /permission denied/,
    );
    await assert.rejects(
      reader.query("create table demo_escape(id int)"),
      /permission denied/,
    );
    const demoCare = await readDemoCarePack(reader);
    const originalDocuments = (
      await database.pool.query(
        "select id,md5(to_jsonb(d)::text) hash from documents d order by id",
      )
    ).rows;
    const consumerSql = await readFile(
      "drizzle/consumer-care/0020_consumer_demo_documents.sql",
      "utf8",
    );
    const collisionClient = await database.pool.connect();
    try {
      await collisionClient.query("begin");
      const doc = consumerDemoDocuments[0];
      await collisionClient.query(
        "insert into documents(id,twin_id,kind,origin,title,content) values($1,$2,'care-card','sample',$3,'conflicting source')",
        [doc.id, doc.twinId, doc.title],
      );
      await assert.rejects(
        collisionClient.query(consumerSql),
        /consumer_demo_document_conflict/,
      );
      await collisionClient.query("rollback");
    } finally {
      collisionClient.release();
    }
    assert.equal(
      (await database.pool.query("select count(*)::int n from documents"))
        .rows[0].n,
      originalDocuments.length,
    );
    await migrate(database.db, {
      migrationsFolder: "drizzle/consumer-care",
      migrationsTable: "__care_consumer_migrations",
    });
    assert.deepEqual(
      (
        await database.pool.query(
          "select hash,created_at from drizzle.__drizzle_migrations order by id",
        )
      ).rows,
      history,
    );
    await migrate(database.db, {
      migrationsFolder: "drizzle/consumer-care",
      migrationsTable: "__care_consumer_migrations",
    });
    assert.equal(
      (await database.pool.query("select count(*)::int n from documents"))
        .rows[0].n,
      originalDocuments.length + 3,
    );
    assert.deepEqual(
      (
        await database.pool.query(
          "select id,md5(to_jsonb(d)::text) hash from documents d where id=any($1::uuid[]) order by id",
          [originalDocuments.map((d) => d.id)],
        )
      ).rows,
      originalDocuments,
    );
    if (process.env.PALCARE_DEMO_BROWSER_JOURNEY === "true") {
      // Synthetic provider only, never seed fake verified purchases into the app.
      const checkout = new CheckoutService(
        database.db,
        new FakePayPal(),
        testConfig,
      );
      const session = randomBytes(32).toString("hex");
      const order = await checkout.start(
        {
          productId: "00000000-0000-4000-8000-000000000101",
          requestId: randomUUID(),
        },
        session,
      );
      assert.equal(
        (await checkout.capture(order.id, session)).state,
        "completed",
      );
    }
    const saved = {
      ...(await readDemoData(database.db, { library: true })),
      consumerDemo: true,
    };
    assertConsumerDemoDocuments({ ...saved, demoCare });
    const feed = careFeed({
      data: { ...saved, demoCare },
      knowledge: [],
      guardian: emptyOverview(),
      activity: { items: [], unavailable: [] },
      now: new Date("2026-11-05T12:00:00Z"),
    });
    assert.equal(careProductCards(feed).length, 10);
    assert.equal(careProductCards(feed, "completed").length, 0);
    assert.equal(careProductCards(feed, "attention").length, 5);
    assert.equal(
      (
        await database.pool.query(
          "select count(*)::int n from guardian_refunds",
        )
      ).rows[0].n,
      0,
    );
    const answer = careStatusAnswer(
      feed,
      1,
      feed.purchases.map((p) => p.id),
      "lower-reference",
    );
    assert.ok(answer.steps.some((s) => s.includes("$1,099.00")));
    assert.ok(answer.text.includes("never establishes"));
    if (process.env.PALCARE_DEMO_BROWSER_JOURNEY === "true")
      await demoCareBrowserJourney(
        target.toString(),
        restricted.toString(),
        { ...saved, demoCare },
        feed,
      );
    // Missing evidence is visible failure, not fixture replacement.
    await database.pool.query(
      "alter table care_demo_evidence disable trigger care_demo_evidence_guard",
    );
    await database.pool.query("delete from care_demo_evidence where ordinal=0");
    await assert.rejects(readDemoCarePack(reader), /No fixture fallback/);
  } finally {
    await reader?.end();
    await database?.pool.end();
    if (created) await admin.query(`drop database ${name}`);
    if (createdRole) await admin.query(`drop role ${role}`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
});
