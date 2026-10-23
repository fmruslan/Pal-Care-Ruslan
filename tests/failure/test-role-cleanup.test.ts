import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createDatabase } from "../../src/db/connection";
import "../../scripts/environment";
const url = process.env.TEST_DATABASE_URL;
if (
  url &&
  (!URL.canParse(url) ||
    !new URL(url).pathname.endsWith("_test") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error("Explicit dedicated local TEST_DATABASE_URL required");
test(
  "SIGTERM cleanup revokes the browser wrapper's six actual disposable logins",
  { skip: !url, timeout: 30000 },
  async () => {
    const { pool } = createDatabase(url!);
    const roles = async () =>
      (
        await pool.query(
          "select rolname from pg_roles where rolname ~ '^test_(reader|careos|checkout|guardian|discovery|recall)_[a-f0-9]{32}$' order by rolname",
        )
      ).rows.map((r) => String(r.rolname));
    const before = await roles();
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/start-test-server.ts", "3144"],
      {
        env: {
          ...process.env,
          DEMO_DATA_SOURCE: "database",
          TEST_DATABASE_URL: url,
          APP_ORIGIN: "http://127.0.0.1:3144",
          GUARDIAN_OPERATIONS_ENABLED: "false",
          AG_STUDIO_LOCAL_EVALUATION_ENABLED: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    // Drain output without persisting inherited private environment values.
    server.stdout.resume();
    server.stderr.resume();
    try {
      let listening = false;
      for (let n = 0; n < 100; n++) {
        if (server.exitCode !== null)
          throw new Error("Wrapper exited before startup");
        try {
          if ((await fetch("http://127.0.0.1:3144/api/health")).ok) {
            listening = true;
            break;
          }
        } catch {
          /* process startup only */
        }
        await delay(100);
      }
      assert.ok(listening);
      assert.equal(
        (await roles()).filter((r) => !before.includes(r)).length,
        6,
      );
      const stopped = once(server, "exit");
      server.kill("SIGTERM");
      await stopped;
      assert.deepEqual(await roles(), before);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const stopped = once(server, "exit");
        server.kill("SIGTERM");
        await stopped;
      }
      await pool.end();
    }
  },
);
