import { spawn } from "node:child_process";
import { testRuntimeRoles } from "../tests/helpers/runtime-roles";
import "./environment";
import { assertBuild } from "./workspace.mjs";
import { isolatedCareEnvironment } from "../tests/helpers/isolated-care-environment";
assertBuild();
const port = process.argv[2];
if (!port || !/^\d{4,5}$/.test(port))
  throw new Error("Explicit test port required");
const roles =
  process.env.DEMO_DATA_SOURCE === "database"
    ? await testRuntimeRoles(process.env.TEST_DATABASE_URL ?? "")
    : null;
const child = spawn(
  process.execPath,
  [
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
      ...process.env,
      ...isolatedCareEnvironment,
      CARE_CONSUMER_SCENARIOS_ENABLED:
        process.env.E2E_CONSUMER_SCENARIOS_ENABLED === "true"
          ? "true"
          : "false",
      CARE_DEMO_ENABLED:
        process.env.E2E_DEMO_CARE_ENABLED === "true" ? "true" : "false",
      CARE_DEMO_READER_DATABASE_URL:
        process.env.E2E_DEMO_CARE_ENABLED === "true"
          ? (roles?.urls.demo_care_reader ?? "")
          : "",
      MIGRATION_DATABASE_URL: "",
      ADMIN_DATABASE_URL: "",
      OPERATOR_DATABASE_URL: "",
      LOCAL_POSTGRES_PASSWORD: "",
      DATABASE_URL: roles?.urls.reader ?? "",
      CAREOS_DATABASE_URL: roles?.urls.careos ?? "",
      GUARDIAN_DATABASE_URL: roles?.urls.guardian ?? "",
      CHECKOUT_DATABASE_URL: "",
      PAYPAL_CHECKOUT_ENABLED: "false",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
      PAYPAL_MERCHANT_ID: "",
      PAYPAL_IMMEDIATE_TEST_REQUEST_ID: "",
      PAYPAL_IMMEDIATE_TEST_SESSION_HASH: "",
      PAYPAL_IMMEDIATE_TEST_BALANCE_CONFIRMED: "false",
      GUARDIAN_REFUNDS_ENABLED: "false",
      GUARDIAN_PROVIDER_READS_ENABLED: "false",
      CAREOS_PROVIDER: "fixture",
      CAREOS_LIVE_ENABLED: "false",
      CAREOS_API_KEY: "",
      DISCOVERY_PROVIDER: "fixture",
      CHANNEL3_LIVE_ENABLED: "false",
      CHANNEL3_API_KEY: "",
    },
  },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  void (async () => {
    await roles?.close();
    process.exitCode = code ?? 0;
  })().catch(() => {
    console.error("Test role cleanup failed; dedicated test DB only.");
    process.exitCode = 1;
  });
});
