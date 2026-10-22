import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";

test(
  "production server reports an unavailable database without fixture fallback or credential disclosure",
  { timeout: 30_000 },
  async () => {
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3102",
      ],
      {
        env: {
          ...process.env,
          DEMO_DATA_SOURCE: "database",
          DATABASE_URL: "postgresql://127.0.0.1:1/unavailable",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    server.stdout.on("data", (chunk) => {
      logs += chunk.toString();
    });
    server.stderr.on("data", (chunk) => {
      logs += chunk.toString();
    });
    try {
      let listening = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null)
          throw new Error("Test server exited before readiness check.");
        try {
          const health = await fetch("http://127.0.0.1:3102/api/health");
          if (health.ok) {
            listening = true;
            break;
          }
        } catch {
          /* Wait for process startup, not database success. */
        }
        await setTimeout(100);
      }
      assert.ok(listening, "Production server must start.");
      const response = await fetch("http://127.0.0.1:3102/api/ready");
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "unavailable" });
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(logs, /postgresql:\/\//);
    } finally {
      if (server.exitCode === null) {
        const closed = once(server, "exit");
        server.kill("SIGTERM");
        await closed;
      }
    }
  },
);
