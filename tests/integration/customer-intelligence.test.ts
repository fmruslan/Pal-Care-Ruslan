import assert from "node:assert/strict";
import { test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { readDemoData } from "../../src/db/read-demo";
import { seedDemo } from "../../src/db/seed";
import { assertDatabaseAuthority } from "../../src/db/authority";
import { testRuntimeRoles } from "../helpers/runtime-roles";
import { customerDataset } from "../../src/lib/intelligence/customer-model";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import "../../scripts/environment";

test("customer Intelligence projects actual saved documents under a restricted read-only test login", async () => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  if (
    !URL.canParse(url) ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error("Explicit dedicated local TEST_DATABASE_URL required.");
  const setup = createDatabase(url);
  await migrate(setup.db, { migrationsFolder: "./drizzle" });
  await seedDemo(setup.db);
  await setup.pool.end();
  const roles = await testRuntimeRoles(url);
  const reader = createDatabase(roles.urls.reader, { readOnly: true });
  try {
    await assertDatabaseAuthority(reader.pool, "reader");
    const before = await readDemoData(reader.db);
    const result = customerDataset(
      { ...before, source: "database" } as typeof before,
      [referenceSource],
      emptyOverview(),
      { items: [], unavailable: [] },
    );
    assert.equal(result.source, "database");
    assert.equal(result.purchases.length, before.twins.length);
    assert.equal(
      result.purchases.reduce((sum, p) => sum + p.documentCount, 0),
      before.documents.length,
    );
    for (const p of result.purchases) {
      const receipt = before.documents.find(
        (d) => d.twinId === p.id && d.kind === "receipt",
      );
      assert.equal(p.receiptHref, receipt ? `/documents/${receipt.id}` : null);
      assert.ok(
        p.documentLinks.every((link) =>
          before.documents.some(
            (d) => d.twinId === p.id && link.href === `/documents/${d.id}`,
          ),
        ),
      );
    }
    assert.equal(result.adjustments.allVerifiedMinor, 0);
    assert.equal(
      result.purchases.find((p) => p.model === "5")?.amountMinor,
      null,
    );
    assert.deepEqual(await readDemoData(reader.db), before);
    await assert.rejects(
      reader.pool.query("update purchase_twins set purchase_price_minor = 1"),
      (error: unknown) =>
        ["42501", "25006"].includes((error as { code?: string }).code ?? ""),
    );
  } finally {
    await reader.pool.end();
    await roles.close();
  }
});
