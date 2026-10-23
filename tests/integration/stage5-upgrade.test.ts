import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { databaseFingerprint } from "../../src/db/preservation";
import { seedDemo } from "../../src/db/seed";
import { CheckoutService } from "../../src/lib/commerce/service";
import { FakePayPal, testConfig } from "../helpers/paypal-fixture";
import { demoData } from "../../src/lib/demo/fixtures";
import "../../scripts/environment";
test("Stage 5 upgrade preserves every legacy row including completed, pending and cancelled synthetic purchases", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error("Explicit local dedicated TEST_DATABASE_URL required");
  const admin = createDatabase(url),
    name = `palcare_upgrade_${randomUUID().replaceAll("-", "")}_test`;
  await admin.pool.query(`create database ${name}`);
  const target = new URL(url);
  target.pathname = `/${name}`;
  const isolated = createDatabase(target.toString());
  try {
    await mkdir("/tmp/opencode", { recursive: true });
    const folder = await mkdtemp("/tmp/opencode/stage5-upgrade-");
    await cp("./drizzle", folder, { recursive: true });
    const journal = JSON.parse(
      await readFile(`${folder}/meta/_journal.json`, "utf8"),
    );
    journal.entries = journal.entries.filter(
      (e: { idx: number }) => e.idx <= 12,
    );
    await writeFile(`${folder}/meta/_journal.json`, JSON.stringify(journal));
    await migrate(isolated.db, { migrationsFolder: folder });
    await seedDemo(isolated.db);
    const gateway = new FakePayPal(),
      service = new CheckoutService(isolated.db, gateway, testConfig);
    const start = async () => {
      const owner = randomUUID().replaceAll("-", "");
      return {
        owner,
        order: await service.start(
          { productId: demoData.products[0].id, requestId: randomUUID() },
          owner,
        ),
      };
    };
    const a = await start();
    assert.equal(
      (await service.capture(a.order.id, a.owner)).state,
      "completed",
    );
    gateway.status = "APPROVED";
    gateway.captureStatus = "PENDING";
    const b = await start();
    assert.equal((await service.capture(b.order.id, b.owner)).state, "pending");
    const c = await start();
    assert.equal(
      (await service.cancel(c.order.id, c.owner)).state,
      "cancelled",
    );
    const before = await databaseFingerprint(isolated.pool);
    assert.equal(Object.keys(before).length, 28);
    await migrate(isolated.db, { migrationsFolder: "./drizzle" });
    assert.deepEqual(
      await databaseFingerprint(isolated.pool, Object.keys(before)),
      before,
    );
    await migrate(isolated.db, { migrationsFolder: "./drizzle" });
    assert.deepEqual(
      await databaseFingerprint(isolated.pool, Object.keys(before)),
      before,
    );
    gateway.captureStatus = "COMPLETED";
    assert.equal(
      (await service.reconcile(b.order.id, b.owner)).state,
      "completed",
    );
  } finally {
    await isolated.pool.end();
    await admin.pool.query(`drop database ${name}`);
    await admin.pool.end();
  }
});
