import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "dotenv";
import { Pool } from "pg";
import {
  assertDatabaseAuthority,
  assertEvidenceGuards,
} from "../src/db/authority";
import { assertBuild, primary } from "./workspace.mjs";
import { privatePreviewEnvironment } from "./private-preview-policy";

async function existing(name: string) {
  try {
    return JSON.parse(
      await readFile(
        join(homedir(), ".config/palcare-chatgpt-pilot", name),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

try {
  const build = assertBuild(true);
  const env = privatePreviewEnvironment(
    parse(await readFile(join(primary, ".env.local"))),
    await existing("application.json"),
    await existing("session.json"),
  );
  for (const [capability, url] of [
    ["reader", env.DATABASE_URL],
    ["careos", env.CAREOS_DATABASE_URL],
  ] as const) {
    const pool = new Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
    });
    try {
      await assertDatabaseAuthority(pool, capability);
      if (capability === "reader") await assertEvidenceGuards(pool);
    } finally {
      await pool.end();
    }
  }
  console.log(
    JSON.stringify({
      privatePreview: "starting",
      commit: build.commit,
      buildId: build.buildId,
      origin: env.APP_ORIGIN,
      aiExpiresAt: env.CAREOS_EVALUATION_EXPIRES_AT,
    }),
  );
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
      cwd: primary,
      stdio: "inherit",
      env: { ...env, HOME: homedir(), PATH: "/usr/local/bin:/usr/bin:/bin" },
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    process.exitCode = 2;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
} catch {
  console.error(
    "STOP: private preview build/runtime-role preflight failed; no credentials, authorization or database records changed.",
  );
  process.exitCode = 2;
}
