import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { testRuntimeRoles } from "../tests/helpers/runtime-roles";
import "./environment";
const port = process.argv[2];
if (!port || !/^\d{4,5}$/.test(port) || ["3000", "55432"].includes(port))
  throw new Error("Explicit isolated test port required");
const roles = await testRuntimeRoles(process.env.TEST_DATABASE_URL ?? "");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const child = spawn(
  process.execPath,
  [
    "--import",
    resolve("tests/helpers/sol-transport.mjs"),
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: roles.urls.reader,
      CAREOS_DATABASE_URL: roles.urls.careos,
      APP_ORIGIN: `http://127.0.0.1:${port}`,
      CAREOS_PROVIDER: "responses",
      CAREOS_LIVE_ENABLED: "true",
      CAREOS_API_KEY: "injected-test-key-no-real-provider-access",
      CAREOS_MODEL: "gpt-6.1-sol",
      CAREOS_PROJECT_ID: "proj_injected_test",
      CAREOS_PROVIDER_LIMIT_CONFIRMED: "true",
      CAREOS_DAILY_BUDGET_MICRO: "5000000",
      CAREOS_TOTAL_BUDGET_MICRO: "5000000",
      CAREOS_BUDGET_ID: "isolated-sol-test",
      CAREOS_EVALUATION_ENABLED: "true",
      CAREOS_EVALUATION_EXPIRES_AT: new Date(
        Date.now() + 3600000,
      ).toISOString(),
      CAREOS_CUSTOMER_ACCESS_HASH: hash("a".repeat(64)),
      CAREOS_STUDIO_ACCESS_HASH: hash("b".repeat(64)),
      AG_STUDIO_LOCAL_EVALUATION_ENABLED: "true",
      PAYPAL_CHECKOUT_ENABLED: "false",
      GUARDIAN_OPERATIONS_ENABLED: "false",
      GUARDIAN_REFUNDS_ENABLED: "false",
      GUARDIAN_PROVIDER_READS_ENABLED: "false",
      PRICE_GUARDIAN_CHECKOUT_ENABLED: "false",
      DISCOVERY_PROVIDER: "fixture",
      CHANNEL3_LIVE_ENABLED: "false",
      CPSC_REFRESH_ENABLED: "false",
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  void roles
    .close()
    .then(() => {
      process.exitCode = code ?? 0;
    })
    .catch(() => {
      console.error("Isolated Sol test role cleanup failed");
      process.exitCode = 1;
    });
});
