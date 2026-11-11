import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createDatabase } from "../../src/db/connection";
import { populateJudgeRecords } from "../../scripts/prepare-render-judge";
import { sanitizedSandbox } from "../../scripts/judge-sandbox";
import { syntheticJudgeSource } from "../helpers/judge-sandbox-fixture";
import { assertEvidenceGuards } from "../../src/db/authority";
import { PostgresStore } from "../../src/lib/careos/postgres-store";
import {
  pricedDeepSeekUsage,
  SOL_RESERVATION_MICRO,
} from "../../src/lib/careos/model-policy";
import "../../scripts/environment";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.endsWith("_test") ||
  !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
)
  throw Error(
    "Explicit dedicated local TEST_DATABASE_URL ending _test required",
  );

test("fresh judge DB uses reviewed migrations, eleven records and existing persistent DeepSeek accounting (synthetic evidence only)", async () => {
  const name = `render_judge_${randomUUID().replaceAll("-", "").slice(0, 12)}_test`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const targetUrl = new URL(url);
  targetUrl.pathname = `/${name}`;
  let target: ReturnType<typeof createDatabase> | undefined;
  let created = false;
  try {
    await admin.query(`create database ${name}`);
    created = true;
    target = createDatabase(targetUrl.toString());
    const s = syntheticJudgeSource();
    await populateJudgeRecords(
      target,
      sanitizedSandbox(s.checkout, s.twin, s.documents, s.events),
    );
    await assertEvidenceGuards(target.pool);
    assert.equal(
      (await target.pool.query("select count(*)::int n from purchase_twins"))
        .rows[0].n,
      11,
    );
    assert.equal(
      (
        await target.pool.query(
          "select count(*)::int n from documents where id in ('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001206','00000000-0000-4000-8000-000000001208')",
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await target.pool.query(
          "select count(*)::int n from care_demo_evidence",
        )
      ).rows[0].n,
      20,
    );
    assert.equal(
      (
        await target.pool.query(
          "select count(*)::int n from care_conversations",
        )
      ).rows[0].n,
      0,
    );
    const store = new PostgresStore(target.pool, {
      dailyMicro: 5000000,
      totalMicro: 5000000,
      budgetId: "render-test",
      reservationMicro: SOL_RESERVATION_MICRO,
      model: "deepseek-flash",
    });
    const owner = "c".repeat(64),
      c = await store.create(owner);
    const input = {
      requestId: randomUUID(),
      twinId: null,
      revision: 0,
      message: "Synthetic DeepSeek test",
    };
    await store.claim(c.id, owner, input);
    const reservation = await store.reserve(c.id, owner, input.requestId);
    const usage = pricedDeepSeekUsage(
      { input_tokens: 1000, output_tokens: 100 },
      10,
    )!;
    await store.settle(
      c.id,
      owner,
      input.requestId,
      reservation,
      usage.micro,
      usage,
    );
    await store.settle(
      c.id,
      owner,
      input.requestId,
      reservation,
      usage.micro,
      usage,
    );
    assert.equal(
      (
        await target.pool.query(
          "select amount from care_buckets where key='spend:total:render-test'",
        )
      ).rows[0].amount,
      usage.micro,
    );
    const unknown = await store.reserve(c.id, owner, input.requestId);
    assert.equal(unknown.call, 2);
    await assert.rejects(store.reserve(c.id, owner, input.requestId));
    assert.equal(
      (
        await target.pool.query(
          "select amount from care_buckets where key='spend:total:render-test'",
        )
      ).rows[0].amount,
      usage.micro + SOL_RESERVATION_MICRO,
    );
  } finally {
    await target?.pool.end();
    if (created) await admin.query(`drop database ${name}`);
    await admin.end();
  }
});
