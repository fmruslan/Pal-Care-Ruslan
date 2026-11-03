import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../../src/db/connection";
import { readDemoData } from "../../src/db/read-demo";
import { seedDemo } from "../../src/db/seed";
import { testRuntimeRoles } from "../helpers/runtime-roles";
import { PostgresStore } from "../../src/lib/careos/postgres-store";
import { digest } from "../../src/lib/careos/security";
import {
  answerRecordsTurn,
  querySavedRecords,
} from "../../src/lib/careos/records/service";
import { emptyRecordsQuery } from "../../src/lib/careos/records/contracts";
import "../../scripts/environment";

test("North records use a dedicated reader and namespaced conversation ownership without model reservations", async () => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  if (
    !URL.canParse(url) ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname)
  )
    throw new Error("Dedicated TEST_DATABASE_URL required");
  const setup = createDatabase(url);
  await migrate(setup.db, { migrationsFolder: "./drizzle" });
  await seedDemo(setup.db);
  await setup.pool.end();
  const roles = await testRuntimeRoles(url);
  const reader = createDatabase(roles.urls.reader, { readOnly: true });
  const writer = createDatabase(roles.urls.careos);
  const store = new PostgresStore(writer.pool, undefined, true);
  const token = randomUUID();
  const recordsOwner = digest(`records-v1:${token}`),
    privateOwner = digest(token);
  let conversation: { id: string } | undefined;
  try {
    const data = await readDemoData(reader.db, { library: true });
    const before = JSON.stringify(data);
    conversation = await store.create(recordsOwner);
    const input = {
      requestId: randomUUID(),
      twinId: data.twins[0].id,
      revision: 1,
      message: "Show my recorded purchase totals",
    };
    assert.equal(await store.claim(conversation.id, recordsOwner, input), null);
    const answer = await answerRecordsTurn({
      input,
      history: [],
      load: async () => ({ ...data, source: "database" }),
      now: () => new Date("2026-11-03T12:00:00Z"),
    });
    const turn = { requestId: input.requestId, message: input.message, answer };
    await store.finish(conversation.id, recordsOwner, turn);
    assert.deepEqual(
      await store.claim(conversation.id, recordsOwner, input),
      turn,
    );
    await assert.rejects(store.get(conversation.id, privateOwner), /not_found/);
    await assert.rejects(
      store.claim(conversation.id, recordsOwner, {
        ...input,
        message: "Changed request",
      }),
      /conflict/,
    );
    const saved = await store.get(conversation.id, recordsOwner);
    const next = {
      ...input,
      requestId: randomUUID(),
      message: "Put those in a list",
    };
    await store.claim(conversation.id, recordsOwner, next);
    const followup = await answerRecordsTurn({
      input: next,
      history: saved.turns,
      load: async () => {
        throw new Error("Formatting may not reload data");
      },
    });
    assert.equal(
      followup.recordsResult?.snapshotId,
      answer.recordsResult?.snapshotId,
    );
    assert.equal(followup.recordsResult?.query.format, "bullets");
    await store.finish(conversation.id, recordsOwner, {
      requestId: next.requestId,
      message: next.message,
      answer: followup,
    });
    const calls = await writer.pool.query(
      "select count(*)::int as n from care_model_calls where request_id = any($1::uuid[])",
      [[input.requestId, next.requestId]],
    );
    assert.equal(calls.rows[0].n, 0);
    assert.equal(
      JSON.stringify(await readDemoData(reader.db, { library: true })),
      before,
    );
    assert.equal(
      querySavedRecords(data, emptyRecordsQuery("2026-11-03")).coverage
        .complete,
      true,
    );
  } finally {
    if (conversation) await store.clear(conversation.id, recordsOwner);
    await reader.pool.end();
    await writer.pool.end();
    await roles.close();
  }
});
