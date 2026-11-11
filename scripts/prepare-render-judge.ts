// One-time operator command. Never a web startup/pre-deploy command.
// Does not load .env.local and never prints keys, credentials, tokens or DSNs.
import { randomBytes, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "../src/db/connection";
import {
  checkoutOrders,
  purchaseTwins,
  documents,
  careEvents,
} from "../src/db/schema";
import { seedDemo } from "../src/db/seed";
import { CUSTOMER_ID, MERCHANT_ID } from "../src/lib/demo/fixtures";
import { insertDemoCareRows } from "./demo-care-data";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
} from "../src/db/authority";
import { judgeSandboxSchema, sanitizedSandbox } from "./judge-sandbox";

async function privateFile(path: string, content: string) {
  await writeFile(path, content, { mode: 0o600, flag: "wx" });
}
const secret = () => randomBytes(32).toString("hex");
async function access(path: string) {
  const customer = secret(),
    studio = secret();
  await privateFile(
    path,
    [
      `CAREOS_CUSTOMER_ACCESS_HASH=${createHash("sha256").update(customer).digest("hex")}`,
      `CAREOS_STUDIO_ACCESS_HASH=${createHash("sha256").update(studio).digest("hex")}`,
      "# Enter the following access tokens ONLY at /ai-evaluation, not as API keys.",
      `CUSTOMER_BROWSER_ACCESS_TOKEN=${customer}`,
      `STUDIO_BROWSER_ACCESS_TOKEN=${studio}`,
      "",
    ].join("\n"),
  );
  console.log(
    "Access hashes/tokens written to the private file. Nothing was activated.",
  );
}

async function exportSandbox(path: string) {
  // Caller provides an operator read connection, never the web environment.
  const source = createDatabase(process.env.SOURCE_DATABASE_URL ?? "", {
    readOnly: true,
    max: 1,
  });
  try {
    const archive = await source.db.transaction(async (tx) => {
      await tx.execute(
        "set transaction isolation level repeatable read, read only",
      );
      const twins = await tx
        .select()
        .from(purchaseTwins)
        .where(
          and(
            eq(purchaseTwins.customerId, CUSTOMER_ID),
            eq(purchaseTwins.merchantId, MERCHANT_ID),
            eq(purchaseTwins.origin, "sandbox"),
            eq(purchaseTwins.purchasedOn, "2026-10-22"),
            eq(purchaseTwins.purchasePriceMinor, 12900),
          ),
        )
        .limit(2);
      if (twins.length !== 1 || !twins[0].checkoutOrderId)
        throw Error("one_historical_purchase_required");
      const twin = twins[0];
      const [checkout] = await tx
        .select()
        .from(checkoutOrders)
        .where(eq(checkoutOrders.id, twin.checkoutOrderId!));
      const docs = await tx
        .select()
        .from(documents)
        .where(eq(documents.twinId, twin.id));
      const events = await tx
        .select()
        .from(careEvents)
        .where(
          and(
            eq(careEvents.twinId, twin.id),
            eq(careEvents.origin, "sandbox"),
            eq(careEvents.kind, "purchase"),
          ),
        );
      if (!checkout) throw Error("original_checkout_required");
      return sanitizedSandbox(checkout, twin, docs, events);
    });
    await privateFile(path, JSON.stringify(archive, null, 2) + "\n");
    console.log(
      "Sanitized historical Sandbox archive written. Source was read-only; no provider called.",
    );
  } finally {
    await source.pool.end();
  }
}

export async function populateJudgeRecords(
  target: ReturnType<typeof createDatabase>,
  input: unknown,
) {
  const archive = judgeSandboxSchema.parse(input);
  await migrate(target.db, { migrationsFolder: "drizzle" });
  await seedDemo(target.db);
  for (const [folder, table] of [
    ["care", "__care_migrations"],
    ["protection", "__care_protection_migrations"],
    ["demo-care", "__care_demo_migrations"],
  ])
    await migrate(target.db, {
      migrationsFolder: `drizzle/${folder}`,
      migrationsTable: table,
    });
  const client = await target.pool.connect();
  try {
    await client.query("begin");
    await insertDemoCareRows(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  await migrate(target.db, {
    migrationsFolder: "drizzle/consumer-care",
    migrationsTable: "__care_consumer_migrations",
  });
  await target.db.transaction(async (tx) => {
    await tx.insert(checkoutOrders).values(archive.checkout);
    await tx.insert(purchaseTwins).values(archive.twin);
    await tx.insert(documents).values(archive.documents);
    await tx.insert(careEvents).values(archive.events);
  });
}

async function prepare(archivePath: string, outputPath: string) {
  const migrationUrl = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
  const internalUrl = new URL(process.env.RENDER_INTERNAL_DATABASE_URL ?? "");
  // Fresh Render DB only. No private/local DB or accidental unrelated target.
  if (
    !migrationUrl.hostname.endsWith("-postgres.render.com") ||
    !migrationUrl.hostname.startsWith("dpg-") ||
    internalUrl.hostname !== migrationUrl.hostname.split(".")[0] ||
    internalUrl.pathname !== migrationUrl.pathname ||
    migrationUrl.pathname !== "/palcare"
  )
    throw Error("isolated_render_database_required");
  const archive = judgeSandboxSchema.parse(
    JSON.parse(await readFile(archivePath, "utf8")),
  );
  const target = createDatabase(migrationUrl.toString(), { max: 1 });
  const readerPassword = secret(),
    carePassword = secret(),
    demoPassword = secret();
  const runtimeUrl = (user: string, password: string) => {
    const url = new URL(internalUrl);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  try {
    const existing = await target.pool.query(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','p') limit 1",
    );
    if (existing.rowCount) throw Error("empty_render_database_required");
    // Preserve newly generated credentials privately before provisioning. Never
    // overwrite an existing file or reset a partially prepared database.
    await privateFile(
      outputPath,
      [
        `DATABASE_URL=${runtimeUrl("palcare_reader_login", readerPassword)}`,
        `CAREOS_DATABASE_URL=${runtimeUrl("palcare_careos_login", carePassword)}`,
        `CARE_DEMO_READER_DATABASE_URL=${runtimeUrl("palcare_demo_reader", demoPassword)}`,
        "",
      ].join("\n"),
    );
    await populateJudgeRecords(target, archive);
    // Existing capability templates, no owner/admin authority in runtime.
    const databaseName = migrationUrl.pathname.slice(1);
    await target.pool.query(
      `REVOKE ALL ON DATABASE "${databaseName}" FROM PUBLIC`,
    );
    await target.pool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await target.pool.query(
      "REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC",
    );
    await target.pool.query(await readFile("scripts/reader-role.sql", "utf8"));
    await target.pool.query(await readFile("scripts/careos-role.sql", "utf8"));
    for (const [login, password, role] of [
      ["palcare_reader_login", readerPassword, "palcare_reader"],
      ["palcare_careos_login", carePassword, "palcare_careos"],
      ["palcare_demo_reader", demoPassword, ""],
    ]) {
      // All interpolated identifiers are fixed literals; passwords are generated hex.
      await target.pool.query(
        `CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await target.pool.query(
        `GRANT CONNECT ON DATABASE "${databaseName}" TO ${login}`,
      );
      if (role)
        await target.pool.query(`GRANT ${role} TO ${login} WITH SET FALSE`);
      else {
        await target.pool.query(`GRANT USAGE ON SCHEMA public TO ${login}`);
        await target.pool.query(
          `GRANT SELECT ON care_demo_packs,care_demo_evidence TO ${login}`,
        );
      }
    }
    for (const [login, password, capability] of [
      ["palcare_reader_login", readerPassword, "reader"],
      ["palcare_careos_login", carePassword, "careos"],
      ["palcare_demo_reader", demoPassword, "demo_care_reader"],
    ] as const) {
      const url = new URL(migrationUrl);
      url.username = login;
      url.password = password;
      const restricted = createDatabase(url.toString(), { max: 1 });
      try {
        await assertDatabaseAuthority(restricted.pool, capability);
        if (capability === "reader")
          await assertEvidenceGuards(restricted.pool);
      } finally {
        await restricted.pool.end();
      }
    }
    console.log(
      "Render judge database populated; restricted runtime connections verified. Copy runtime URLs from the private output file into Render. No provider/financial operation occurred.",
    );
  } finally {
    await target.pool.end();
  }
}

async function main() {
  const [action, path, output] = process.argv.slice(2);
  if (action === "--access" && path && !output) return access(path);
  if (action === "--export-sandbox" && path && !output)
    return exportSandbox(path);
  if (action === "--prepare-db" && path && output) return prepare(path, output);
  throw Error(
    "Use --access PRIVATE_FILE, --export-sandbox PRIVATE_ARCHIVE, or --prepare-db PRIVATE_ARCHIVE PRIVATE_RUNTIME_FILE",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "Render preparation stopped. Check the explicit operator inputs, fresh Render target and historical evidence. No credentials or provider errors logged; do not reset an existing database.",
    );
    process.exitCode = 1;
  });
