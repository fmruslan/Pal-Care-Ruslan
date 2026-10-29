import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { parse } from "dotenv";
import { Pool } from "pg";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
  runtimeReads,
} from "../src/db/authority";
import { PilotFiles } from "../src/lib/careos/subscription/files";
import {
  subscriptionSession,
  SUBSCRIPTION_SESSION,
} from "../src/lib/careos/subscription/session";
import { restrictedRuntimeUrls } from "../src/lib/careos/subscription/runtime-policy";
import { assertBuild, assertWorkspace } from "./workspace.mjs";

// Owner-only launcher: read ONLY the already verified restricted runtime URLs.
// Neither the source file nor arbitrary process credentials reach the web child.
const files = new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
const runtimeFile = "/home/bigrus/projects/palcare/.env.local";
let connections: { reader: Pool; writer: Pool } | undefined;
type Manifest = {
  core: Record<string, { count: number; hash: string }>;
  oldCare: Record<string, { id: string; hash: string }[]>;
  schema: { tables: number; solUsageColumn: boolean };
};
async function manifest(): Promise<Manifest> {
  if (!connections) throw new Error("Runtime connections not initialized");
  const { reader, writer } = connections;
  await assertDatabaseAuthority(reader, "reader");
  await assertEvidenceGuards(reader);
  await assertDatabaseAuthority(writer, "careos");
  const core: Manifest["core"] = {};
  // Hash original records without exporting their data or provider identities.
  for (const table of [
    ...runtimeReads.reader,
    "checkout_orders",
    "checkout_rate_limits",
    "guardian_bindings",
  ]) {
    const allowed = await reader.query(
      "select has_table_privilege(current_user,$1,'SELECT') allowed",
      [`public.${table}`],
    );
    if (!allowed.rows[0].allowed) continue;
    const r = await reader.query(
      `select count(*)::int count, md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by md5(row_to_json(t)::text)),'')) hash from public.${table} t`,
    );
    core[table] = r.rows[0];
  }
  const oldCare: Manifest["oldCare"] = {};
  for (const table of [
    "care_conversations",
    "care_requests",
    "care_model_calls",
  ])
    oldCare[table] = (
      await writer.query(
        `select ${table === "care_model_calls" ? "request_id::text || ':' || call::text" : "id::text"} id, md5(row_to_json(t)::text) hash from public.${table} t`,
      )
    ).rows;
  oldCare.care_buckets = (
    await writer.query(
      "select key id, md5(row_to_json(t)::text) hash from care_buckets t where key like 'spend:%'",
    )
  ).rows;
  const tables = (
    await reader.query(
      "select count(*)::int n from pg_tables where schemaname='public'",
    )
  ).rows[0].n;
  const solUsageColumn = (
    await writer.query(
      "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='care_model_calls' and column_name='usage') yes",
    )
  ).rows[0].yes;
  return { core, oldCare, schema: { tables, solUsageColumn } };
}
try {
  assertWorkspace();
  if (process.argv[2] === "start") assertBuild(true);
  const urls = restrictedRuntimeUrls(parse(await readFile(runtimeFile)));
  connections = {
    reader: new Pool({
      connectionString: urls.reader,
      max: 1,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
    }),
    writer: new Pool({
      connectionString: urls.careos,
      max: 1,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
    }),
  };
  const { reader, writer } = connections;
  await files.prepare();
  if (process.argv[2] === "verify-preservation") {
    const before = (await files.read("preservation.json")) as Manifest;
    if (!before) throw new Error("Original preservation manifest required");
    const after = await manifest();
    if (
      JSON.stringify(before.core) !== JSON.stringify(after.core) ||
      JSON.stringify(before.schema) !== JSON.stringify(after.schema)
    )
      throw new Error("Original source records or schema changed");
    for (const [table, rows] of Object.entries(before.oldCare))
      for (const row of rows)
        if (
          !after.oldCare[table].some(
            (r) => r.id === row.id && r.hash === row.hash,
          )
        )
          throw new Error("Original CareOS evidence changed");
    console.log(
      JSON.stringify({
        preservation: "PASS",
        sourceTables: Object.keys(after.core).length,
        originalCareRows: Object.values(before.oldCare).reduce(
          (n, r) => n + r.length,
          0,
        ),
        schema: after.schema,
      }),
    );
  } else if (process.argv[2] === "start") {
    const session = await subscriptionSession(files);
    const app = await files.locked(async () => {
      let record = (await files.read("application.json")) as {
        origin: string;
        customer: string;
        studio: string;
        expiresAt: number;
      } | null;
      if (!record) {
        record = {
          origin: "http://127.0.0.1:3002",
          customer: randomBytes(32).toString("hex"),
          studio: randomBytes(32).toString("hex"),
          expiresAt: session.expiresAt,
        };
        await files.write("application.json", record);
      }
      if (
        record.expiresAt <= Date.now() ||
        record.origin !== "http://127.0.0.1:3002"
      )
        throw new Error("Private session expired or origin changed");
      if (!(await files.read("preservation.json")))
        await files.write("preservation.json", await manifest());
      else await manifest(); // Reverify actual roles/schema; never overwrite the baseline.
      return record;
    });
    if ((await manifest()).schema.solUsageColumn)
      throw new Error(
        "Expected unchanged original 0015 schema; stop for review",
      );
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    await reader.end();
    await writer.end();
    const child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3002",
      ],
      {
        stdio: "inherit",
        env: {
          PATH: process.env.PATH,
          HOME: homedir(),
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
          APP_ORIGIN: app.origin,
          DEMO_DATA_SOURCE: "database",
          DATABASE_URL: urls.reader,
          CAREOS_DATABASE_URL: urls.careos,
          CAREOS_PROVIDER: "subscription",
          CAREOS_MODEL: "gpt-6.1-sol",
          CAREOS_SUBSCRIPTION_ENABLED: "true",
          CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
          CAREOS_SUBSCRIPTION_SESSION_ID: SUBSCRIPTION_SESSION,
          CAREOS_EVALUATION_ENABLED: "true",
          CAREOS_OWNER_PAIRING_ENABLED: "true",
          CAREOS_OWNER_SSH_TARGET: "bigrus@greatbison.tail9e8802.ts.net",
          CAREOS_EVALUATION_EXPIRES_AT: new Date(app.expiresAt).toISOString(),
          CAREOS_CUSTOMER_ACCESS_HASH: hash(app.customer),
          CAREOS_STUDIO_ACCESS_HASH: hash(app.studio),
          PAYPAL_CHECKOUT_ENABLED: "false",
          GUARDIAN_OPERATIONS_ENABLED: "false",
          GUARDIAN_REFUNDS_ENABLED: "false",
          GUARDIAN_PROVIDER_READS_ENABLED: "false",
          PRICE_GUARDIAN_CHECKOUT_ENABLED: "false",
          DISCOVERY_PROVIDER: "fixture",
          CHANNEL3_LIVE_ENABLED: "false",
          CPSC_REFRESH_ENABLED: "false",
          AG_STUDIO_LOCAL_EVALUATION_ENABLED: "true",
        },
      },
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.on(signal, () => child.kill(signal));
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
    });
  } else throw new Error("Expected start or verify-preservation");
} catch {
  console.error(
    "STOP: private subscription runtime preflight/preservation failed; no migrations or financial operations performed.",
  );
  process.exitCode = 2;
} finally {
  await connections?.reader.end().catch(() => {});
  await connections?.writer.end().catch(() => {});
}
