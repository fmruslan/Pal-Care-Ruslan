import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { DiscoveryService } from "../../src/lib/discovery/service";
import { Channel3Gateway } from "../../src/lib/discovery/provider";
import "../../scripts/environment";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw new Error("Explicit local dedicated TEST_DATABASE_URL required.");
const { db, pool } = createDatabase(url);
class Double extends Channel3Gateway {
  calls = 0;
  reads = 0;
  fail = false;
  constructor() {
    super("TEST_ONLY");
  }
  async search() {
    this.calls++;
    if (this.fail) throw new Error("Injected timeout");
    return [
      {
        id: "TEST_PRODUCT",
        title: "Test headphone",
        brands: [],
        offers: [],
        category: { title: "Headphones" },
      },
    ];
  }
  async retrieve(id: string) {
    this.reads++;
    return {
      id,
      title: "Test headphone",
      brands: [],
      category: { title: "Headphones" },
      offers: [
        {
          url: "https://www.bestbuy.com/test",
          domain: "bestbuy.com",
          price: { price: 100, currency: "USD" },
          availability: "InStock",
          condition: "new",
        },
      ],
    };
  }
}
before(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});
beforeEach(async () => {
  await pool.query("delete from discovery_usage");
  await pool.query("delete from discovery_products");
});
after(async () => {
  await pool.query("delete from discovery_usage");
  await pool.query("delete from discovery_products");
  await pool.end();
});
test("persistent concurrent search budget permits one dispatch, not one per browser/service", async () => {
  const gateway = new Double();
  const a = new DiscoveryService(pool, gateway, {
    budgetId: "test",
    maxSearches: 1,
  });
  const b = new DiscoveryService(pool, gateway, {
    budgetId: "test",
    maxSearches: 1,
  });
  await Promise.allSettled([
    a.discover("headphones"),
    b.discover("headphones"),
  ]);
  assert.equal(gateway.calls, 1);
  assert.equal(
    (
      await pool.query(
        "select amount from discovery_usage where key='search:test'",
      )
    ).rows[0].amount,
    1,
  );
});
test("unknown API outcome keeps its reservation, never automatic retry", async () => {
  const gateway = new Double();
  gateway.fail = true;
  const service = new DiscoveryService(pool, gateway, {
    budgetId: "test",
    maxSearches: 1,
  });
  await assert.rejects(service.discover("headphones"));
  await assert.rejects(service.discover("headphones"));
  assert.equal(gateway.calls, 1);
  assert.equal(
    (await pool.query("select count(*)::int n from discovery_products")).rows[0]
      .n,
    0,
  );
});
test("only product IDs persist; offer data is retrieved fresh before display", async () => {
  const gateway = new Double();
  const service = new DiscoveryService(pool, gateway, {
    budgetId: "test",
    maxSearches: 1,
  });
  await service.discover("headphones");
  assert.equal(
    (await service.alternatives("headphones"))[0].amountMinor,
    10000,
  );
  await service.alternatives("headphones");
  assert.equal(gateway.reads, 2);
  assert.deepEqual(
    Object.keys(
      (await pool.query("select * from discovery_products")).rows[0],
    ).sort(),
    ["category", "discovered_at", "id"],
  );
});
test("real-provider permission preflight rejects an evidence-capable writer before spending", async () => {
  const gateway = new Double();
  const service = new DiscoveryService(pool, gateway, {
    budgetId: "test",
    maxSearches: 1,
    restrictedWriter: true,
  });
  await assert.rejects(
    service.discover("headphones"),
    /discovery_writer_not_restricted/,
  );
  assert.equal(gateway.calls, 0);
});
test("a real least-privilege PostgreSQL role passes provider preflight without commerce authority", async () => {
  const role = `discovery_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(
    `create role ${role} nologin nosuperuser nocreatedb nocreaterole noinherit`,
  );
  let restricted: Pool | undefined;
  try {
    await pool.query(`grant usage on schema public to ${role}`);
    await pool.query(
      `grant select,insert,update on discovery_usage to ${role}`,
    );
    await pool.query(`grant select,insert on discovery_products to ${role}`);
    restricted = new Pool({
      connectionString: url,
      options: `-c role=${role}`,
      max: 2,
    });
    const gateway = new Double();
    const service = new DiscoveryService(restricted, gateway, {
      budgetId: "least-privilege",
      maxSearches: 1,
      restrictedWriter: true,
    });
    await service.discover("headphones");
    assert.equal(
      (await service.alternatives("headphones"))[0].amountMinor,
      10000,
    );
    await assert.rejects(
      restricted.query("update checkout_orders set state=state"),
      { code: "42501" },
    );
    assert.equal(gateway.calls, 1);
  } finally {
    await restricted?.end();
    await pool.query(
      `revoke all on discovery_usage,discovery_products from ${role}`,
    );
    await pool.query(`revoke usage on schema public from ${role}`);
    await pool.query(`drop role ${role}`);
  }
});
