import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { PostgresStore } from "../../src/lib/careos/postgres-store";
import {
  SOL_RESERVATION_MICRO,
  pricedUsage,
} from "../../src/lib/careos/model-policy";
import { databaseFingerprint } from "../../src/db/preservation";
import { testRuntimeRoles } from "../helpers/runtime-roles";
import "../../scripts/environment";
test("0016 preserves legacy calls; Sol shares an atomic capped budget across scopes and keeps unknown usage", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (
    !url ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error("Explicit dedicated TEST_DATABASE_URL required");
  const root = createDatabase(url),
    name = `sol_upgrade_${randomUUID().replaceAll("-", "")}_test`;
  await root.pool.query(`create database ${name}`);
  const target = new URL(url);
  target.pathname = `/${name}`;
  const db = createDatabase(target.toString());
  let roles: Awaited<ReturnType<typeof testRuntimeRoles>> | undefined,
    writer: ReturnType<typeof createDatabase> | undefined;
  try {
    await mkdir("/tmp/opencode", { recursive: true });
    const folder = await mkdtemp("/tmp/opencode/sol-migration-");
    await cp("./drizzle", folder, { recursive: true });
    const j = JSON.parse(
      await readFile(folder + "/meta/_journal.json", "utf8"),
    );
    j.entries = j.entries.filter((e: { idx: number }) => e.idx <= 15);
    await writeFile(folder + "/meta/_journal.json", JSON.stringify(j));
    await migrate(db.db, { migrationsFolder: folder });
    const legacy = new PostgresStore(db.pool, {
      dailyMicro: 1000000,
      totalMicro: 1000000,
      budgetId: "same-evaluation",
    });
    const owner = "a".repeat(64),
      conversation = await legacy.create(owner),
      input = {
        requestId: randomUUID(),
        twinId: null,
        revision: 0,
        message: "legacy unknown",
      };
    await legacy.claim(conversation.id, owner, input);
    const unknown = await legacy.reserve(
        conversation.id,
        owner,
        input.requestId,
      ),
      known = await legacy.reserve(conversation.id, owner, input.requestId);
    await legacy.settle(conversation.id, owner, input.requestId, known, 100);
    const before = await databaseFingerprint(db.pool),
      oldCalls = (
        await db.pool.query(
          "select to_jsonb(t) row from care_model_calls t order by call",
        )
      ).rows;
    await migrate(db.db, { migrationsFolder: "./drizzle" });
    const after = await databaseFingerprint(
      db.pool,
      Object.keys(before).filter((x) => x !== "care_model_calls"),
    );
    const expected = { ...before };
    delete expected.care_model_calls;
    assert.deepEqual(after, expected);
    assert.deepEqual(
      (
        await db.pool.query(
          "select to_jsonb(t)-'usage' row from care_model_calls t order by call",
        )
      ).rows,
      oldCalls,
    );
    await legacy.settle(conversation.id, owner, input.requestId, unknown, 200); // Release from saved 40000, not new Sol bound.
    assert.equal(
      (
        await db.pool.query(
          "select amount from care_buckets where key='spend:total:same-evaluation'",
        )
      ).rows[0].amount,
      300,
    );
    roles = await testRuntimeRoles(target.toString());
    writer = createDatabase(roles.urls.careos);
    const sol = new PostgresStore(
      writer.pool,
      {
        dailyMicro: 240300,
        totalMicro: 240300,
        budgetId: "same-evaluation",
        reservationMicro: SOL_RESERVATION_MICRO,
      },
      true,
    );
    const customer = await sol.create("b".repeat(64)),
      studio = await sol.create("c".repeat(64));
    const req1 = { ...input, requestId: randomUUID(), message: "customer" },
      req2 = { ...input, requestId: randomUUID(), message: "studio" };
    await sol.claim(customer.id, "b".repeat(64), req1);
    await sol.claim(studio.id, "c".repeat(64), req2);
    const c1 = await sol.reserve(customer.id, "b".repeat(64), req1.requestId);
    const races = await Promise.allSettled([
      sol.reserve(customer.id, "b".repeat(64), req1.requestId),
      sol.reserve(studio.id, "c".repeat(64), req2.requestId),
    ]);
    assert.equal(races.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      (
        await db.pool.query(
          "select amount from care_buckets where key='spend:total:same-evaluation'",
        )
      ).rows[0].amount,
      240300,
    );
    const u = pricedUsage(
      {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 10 },
      },
      10,
    )!;
    await sol.settle(
      customer.id,
      "b".repeat(64),
      req1.requestId,
      c1,
      u.micro,
      u,
    );
    assert.equal(
      (
        await db.pool.query(
          "select amount from care_buckets where key='spend:total:same-evaluation'",
        )
      ).rows[0].amount,
      120800,
    );
    assert.deepEqual(
      (
        await db.pool.query(
          "select usage from care_model_calls where request_id=$1 and call=1",
          [req1.requestId],
        )
      ).rows[0].usage,
      u,
    );
    await sol.settle(
      customer.id,
      "b".repeat(64),
      req1.requestId,
      c1,
      u.micro,
      u,
    );
    await assert.rejects(
      sol.settle(customer.id, "b".repeat(64), req1.requestId, c1, u.micro, {
        ...u,
        latencyMs: 11,
      }),
      { code: "careos_usage_conflict" },
    );
    // Deleting only these test transcripts never replenishes the unknown call or total budget.
    await db.pool.query(
      "delete from care_conversations where id=any($1::uuid[])",
      [[customer.id, studio.id]],
    );
    assert.equal(
      (
        await db.pool.query(
          "select amount from care_buckets where key='spend:total:same-evaluation'",
        )
      ).rows[0].amount,
      120800,
    );
    const fingerprint = await databaseFingerprint(db.pool);
    await migrate(db.db, { migrationsFolder: "./drizzle" });
    assert.deepEqual(await databaseFingerprint(db.pool), fingerprint);
  } finally {
    await writer?.pool.end();
    await roles?.close();
    await db.pool.end();
    await root.pool.query(`drop database ${name}`);
    await root.pool.end();
  }
});
