// Dedicated PostgreSQL and injected gateway/planner only. Never application data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
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
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { seedDemo } from "../../src/db/seed";
import {
  products,
  purchaseTwins,
  documents,
  careEvents,
} from "../../src/db/schema";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
  runtimeReads,
} from "../../src/db/authority";
import {
  reviewedProtectionMigration,
  protectionRootBaseline,
  PROTECTION_MIGRATION_FOLDER,
  PROTECTION_JOURNAL,
} from "../../scripts/protection-migration-plan";
import { CARE_MIGRATION_FOLDER } from "../../scripts/care-migration-plan";
import {
  runProtectionChecks,
  readProtection,
} from "../../src/lib/care/protection/store";
import { protectionView } from "../../src/lib/care/protection/model";
import { careFeed } from "../../src/lib/care/model";
import { careStatusAnswer } from "../../src/lib/care/answer";
import { careProductCards } from "../../src/lib/care/summary";
import { demoData } from "../../src/lib/demo/fixtures";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { GuardianService } from "../../src/lib/price-guardian/service";
import { OperatorService, digestToken } from "../../src/lib/operator/service";
import {
  GUARDIAN_PRODUCT,
  guardianPolicyHash,
  offerHash,
} from "../../src/lib/price-guardian/policy";
import { CheckoutService } from "../../src/lib/commerce/service";
import { newSessionToken, sessionHash } from "../../src/lib/commerce/security";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw Error(
    "Protection tests require an explicit local dedicated TEST_DATABASE_URL ending _test",
  );

test("selected protection migration repeats safely and leaves root API 0016 genuinely pending", async () => {
  const name = `protection_lane_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`,
    admin = new Pool({ connectionString: url, max: 1 });
  const target = new URL(url);
  target.pathname = `/${name}`;
  const folder = await mkdtemp(
    join(
      existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir(),
      "protection-lane-",
    ),
  );
  let db: ReturnType<typeof createDatabase> | undefined;
  let created = false;
  const createdGroups: string[] = [];
  const groups = [
    "palcare_care_reader",
    "palcare_care_reporter",
    "palcare_care_watch_worker",
    "palcare_protection_reader",
    "palcare_protection_worker",
  ];
  try {
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_roles where rolname=any($1::text[])",
          [groups],
        )
      ).rows[0].n,
      0,
    );
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
    db = createDatabase(target.toString());
    await migrate(db.db, { migrationsFolder: folder });
    await seedDemo(db.db);
    await migrate(db.db, { migrationsFolder: CARE_MIGRATION_FOLDER });
    createdGroups.push(...groups.slice(0, 3));
    const plan = await reviewedProtectionMigration();
    const history = async () =>
      (
        await db!.pool.query(
          "select hash,created_at from drizzle.__drizzle_migrations order by created_at,id",
        )
      ).rows;
    const before = await history();
    protectionRootBaseline(before, plan);
    await migrate(db.db, {
      migrationsFolder: PROTECTION_MIGRATION_FOLDER,
      migrationsTable: PROTECTION_JOURNAL,
    });
    createdGroups.push(...groups.slice(3));
    await migrate(db.db, {
      migrationsFolder: PROTECTION_MIGRATION_FOLDER,
      migrationsTable: PROTECTION_JOURNAL,
    });
    assert.deepEqual(await history(), before);
    assert.equal(
      (
        await db.pool.query(
          "select count(*)::int n from drizzle.__care_protection_migrations",
        )
      ).rows[0].n,
      1,
    );
    const column = async () =>
      (
        await db!.pool.query(
          "select count(*)::int n from information_schema.columns where table_schema='public' and table_name='care_model_calls' and column_name='usage'",
        )
      ).rows[0].n;
    assert.equal(await column(), 0);
    // Dedicated DB only: verify future API migration was not silently skipped.
    await migrate(db.db, { migrationsFolder: "drizzle" });
    assert.equal(await column(), 1);
  } finally {
    if (db) await db.pool.end();
    if (created) await admin.query(`drop database ${name}`);
    for (const group of createdGroups.reverse())
      await admin.query(`drop role ${group}`);
    await admin.end();
    await rm(folder, { recursive: true, force: true });
  }
});

class CoveredTestGateway extends FakePayPal {
  time = "";
  async capture(id: string, key: string) {
    await super.capture(id, key);
    this.time = new Date().toISOString();
  }
  async retrieve(id: string) {
    const result = await super.retrieve(id);
    for (const capture of result.purchaseUnits[0].payments.captures)
      capture.createTime = this.time;
    return result;
  }
  async retrieveCapture(id: string) {
    return { ...(await super.retrieveCapture(id)), createTime: this.time };
  }
}

test("purchase → policy discovery → real restricted checks → qualifying event/notification → shared Care/North, preserving old evidence and authority", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12),
    name = `protection_journey_${suffix}_test`;
  const admin = new Pool({ connectionString: url, max: 1 }),
    target = new URL(url);
  target.pathname = `/${name}`;
  const groups = {
      reader: `protect_read_${suffix}`,
      worker: `protect_work_${suffix}`,
    },
    logins: string[] = [],
    pools: Pool[] = [];
  let database: ReturnType<typeof createDatabase> | undefined;
  try {
    await admin.query(`create database ${name}`);
    database = createDatabase(target.toString());
    await migrate(database.db, { migrationsFolder: "drizzle" });
    await seedDemo(database.db);
    await database.pool.query(
      `revoke temporary on database ${name} from public`,
    );
    const originalReaderName = `protect_original_${suffix}`,
      password = randomBytes(24).toString("hex");
    await database.pool.query(
      `create role ${originalReaderName} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}';grant usage on schema public to ${originalReaderName};grant select on ${runtimeReads.reader.join(",")} to ${originalReaderName}`,
    );
    logins.push(originalReaderName);
    const oldURL = new URL(target);
    oldURL.username = originalReaderName;
    oldURL.password = password;
    const originalReader = new Pool({
      connectionString: oldURL.toString(),
      max: 1,
    });
    pools.push(originalReader);
    await assertDatabaseAuthority(originalReader, "reader");
    const operators = new OperatorService(database.pool),
      guardian = new GuardianService(database.pool);
    const grant = await operators.issue({
      actions: ["policy:publish", "price:publish"],
      caseId: null,
      hours: 1,
    });
    const session = digestToken(await operators.activate(grant.code));
    await guardian.publishPolicy(session);
    const gateway = new CoveredTestGateway(),
      checkout = new CheckoutService(database.db, gateway, {
        ...testConfig,
        guardianPolicyEnabled: true,
      });
    const owner = sessionHash(newSessionToken());
    const order = await checkout.start(
      {
        productId: GUARDIAN_PRODUCT,
        requestId: randomUUID(),
        offerHash: offerHash(
          { id: GUARDIAN_PRODUCT, priceMinor: 12900, currency: "USD" },
          guardianPolicyHash,
        ),
      },
      owner,
    );
    const completed = await checkout.capture(order.id, owner);
    assert.equal(completed.state, "completed");
    assert.ok(completed.twinId);
    const twinId = completed.twinId;
    const fingerprint = async () =>
      (
        await database!.pool.query(
          "select json_build_object('twins',(select json_agg(t order by id) from purchase_twins t),'documents',(select json_agg(d order by id) from documents d),'events',(select json_agg(e order by id) from care_events e),'orders',(select json_agg(o order by id) from checkout_orders o)) as evidence",
        )
      ).rows[0].evidence;
    const before = await fingerprint();
    const proposal = (
      await readFile("docs/proposals/care-price-protection.sql", "utf8")
    )
      .replaceAll("palcare_protection_reader", groups.reader)
      .replaceAll("palcare_protection_worker", groups.worker);
    await database.pool.query(proposal);
    for (const kind of ["reader", "worker"] as const) {
      const login = `protect_${kind}_${suffix}`,
        secret = randomBytes(24).toString("hex");
      await database.pool.query(
        `create role ${login} login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${secret}';grant ${groups[kind]} to ${login};grant usage on schema public to ${login}`,
      );
      logins.push(login);
      const link = new URL(target);
      link.username = login;
      link.password = secret;
      pools.push(new Pool({ connectionString: link.toString(), max: 2 }));
    }
    const reader = pools[1],
      worker = pools[2];
    await assertDatabaseAuthority(reader, "protection_reader");
    await assertDatabaseAuthority(worker, "protection_worker");
    await assertDatabaseAuthority(originalReader, "reader");
    await assertEvidenceGuards(originalReader);
    await assert.rejects(
      originalReader.query("select * from care_protection_jobs"),
    );
    for (const pool of [reader, worker])
      for (const query of [
        "select session_hash from checkout_orders",
        "select * from care_requests",
        "update products set price_minor=1",
        "delete from purchase_twins",
        "insert into guardian_cases(id) values(gen_random_uuid())",
      ])
        await assert.rejects(pool.query(query));
    await assert.rejects(
      reader.query("insert into care_protection_jobs(twin_id) values($1)", [
        twinId,
      ]),
    );
    const lease = await database.pool.connect();
    try {
      await lease.query("begin");
      await lease.query("select pg_advisory_xact_lock(61422,2)");
      assert.deepEqual(await runProtectionChecks(worker), {
        checked: 0,
        discovered: 0,
        notifications: 0,
        locked: true,
      });
    } finally {
      await lease.query("rollback");
      lease.release();
    }
    const first = await runProtectionChecks(worker);
    assert.equal(first.discovered, 5);
    assert.equal(first.checked, 5);
    assert.equal(first.notifications, 0);
    if (process.env.PALCARE_PROTECTION_HOST_ISOLATION === "true") {
      const { workerHostProof } = await import("../helpers/worker-host-proof");
      assert.equal(
        (await workerHostProof(worker.options.connectionString!, "protection"))
          .hostIsolation,
        "passed",
      );
    }
    const firstData = await readProtection(reader, twinId);
    let view = protectionView(twinId, firstData.saved, {
      input: firstData.inputs[0],
      now: new Date(),
      scheduled: true,
    });
    assert.equal(view.state, "watching");
    assert.equal(view.policyVerified, true);
    assert.ok(view.deadline);
    assert.equal(
      firstData.saved.evidence.filter((e) => e.kind === "catalog").length,
      1,
    );
    assert.equal(
      (await runProtectionChecks(worker)).checked,
      0,
      "early repeat never checks prices again",
    );
    const legacy = await readProtection(
      reader,
      "00000000-0000-4000-8000-000000000201",
    );
    assert.equal(
      protectionView(legacy.inputs[0].twinId, legacy.saved, {
        input: legacy.inputs[0],
        now: new Date(),
        scheduled: true,
      }).state,
      "unavailable",
    );
    await guardian.publishPrice(session, randomUUID(), "drop");
    assert.equal(
      (await runProtectionChecks(worker)).checked,
      0,
      "price publication does not bypass daily due time",
    );
    // Dedicated test clock precondition only: make the next job due, retaining
    // its real immutable first observation. No production cadence override exists.
    await database.pool.query(
      "update care_protection_jobs set last_checked_at=now()-interval '25 hours',next_check_at=now()-interval '1 hour' where twin_id=$1",
      [twinId],
    );
    const detected = await runProtectionChecks(worker);
    assert.equal(detected.checked, 1);
    assert.equal(detected.notifications, 1);
    const current = await readProtection(reader);
    view = protectionView(twinId, current.saved, {
      input: current.inputs.find((i) => i.twinId === twinId),
      now: new Date(),
      scheduled: true,
    });
    assert.equal(view.state, "opportunity");
    assert.equal(view.differenceMinor, 2000);
    assert.equal(view.notifications.length, 1);
    assert.equal(
      (await runProtectionChecks(worker)).notifications,
      0,
      "repeat cannot duplicate the notice",
    );
    const data = {
      ...demoData,
      source: "database" as const,
      twins: await database.db.select().from(purchaseTwins),
      documents: await database.db.select().from(documents),
      events: await database.db.select().from(careEvents),
      products: await database.db.select().from(products),
    };
    const feed = careFeed({
      data,
      knowledge: [],
      guardian: emptyOverview(),
      activity: { items: [], unavailable: [] },
      protection: { ...current, scheduled: true },
    });
    const cards = careProductCards(feed);
    assert.equal(cards.length, 5);
    assert.equal(cards[0].item.purchase.id, twinId);
    assert.equal(careProductCards(feed, "watching").length, 1);
    assert.equal(careProductCards(feed, "completed").length, 0);
    assert.equal(
      feed.ownership.find((v) => v.twinId === twinId)!.pill.label,
      "Possible adjustment available",
    );
    assert.equal(
      feed.ownership
        .find((v) => v.twinId === twinId)!
        .facts.find((f) => f.topic === "price-window")!.date,
      view.deadline,
    );
    const answer = careStatusAnswer(feed, 1, [twinId], "open_price");
    assert.equal(answer.context?.twinId, twinId);
    assert.ok(answer.steps.join(" ").includes("nothing is sent or refunded"));
    assert.equal(answer.careHighlights?.[0].topic, "price");
    assert.equal(answer.ownershipPresentation?.twinId, twinId);
    await assert.rejects(
      worker.query("update care_protection_evidence set facts='{}'::jsonb"),
    );
    await assert.rejects(
      worker.query("delete from care_protection_notifications"),
    );
    await assert.rejects(
      database.pool.query(
        "update care_protection_evidence set content_hash=repeat('0',64)",
      ),
    );
    assert.deepEqual(
      await fingerprint(),
      before,
      "price checks and notifications never rewrite original purchase evidence",
    );
    assert.equal(
      gateway.captureCalls.length,
      1,
      "worker/North never dispatch another financial operation",
    );
    // Turning monitoring off is honest and preserves every saved observation.
    assert.equal(
      protectionView(twinId, current.saved, {
        input: current.inputs.find((i) => i.twinId === twinId),
        now: new Date(),
        scheduled: false,
      }).monitoring,
      false,
    );
    if (process.env.PALCARE_PROTECTION_BROWSER_JOURNEY === "true") {
      const { protectionBrowserJourney } =
        await import("../helpers/protection-browser-journey");
      await protectionBrowserJourney(
        target.toString(),
        reader.options.connectionString!,
        feed,
        twinId,
      );
    }
    // Additional fictional inputs exist only in this disposable DB and only
    // after five-purchase journey/preservation acceptance. One run touches at
    // most 50 unique purchases, including both discovery and actual checking.
    await database.db.insert(purchaseTwins).values(
      Array.from({ length: 51 }, () => ({
        ...demoData.twins[1],
        id: randomUUID(),
      })),
    );
    const bounded = await runProtectionChecks(worker);
    assert.equal(bounded.discovered, 50);
    assert.equal(bounded.checked, 50);
    const remainder = await runProtectionChecks(worker);
    assert.equal(remainder.discovered, 1);
    assert.equal(remainder.checked, 1);
  } finally {
    for (const pool of pools.reverse()) await pool.end();
    if (database) await database.pool.end();
    await admin.query(`drop database if exists ${name}`);
    for (const login of logins.reverse())
      await admin.query(`drop role ${login}`);
    for (const group of Object.values(groups))
      if (
        (await admin.query("select 1 from pg_roles where rolname=$1", [group]))
          .rowCount
      )
        await admin.query(`drop role ${group}`);
    await admin.end();
  }
});
