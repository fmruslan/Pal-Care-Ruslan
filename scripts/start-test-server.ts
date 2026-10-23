import { spawn } from "node:child_process";
import { testRuntimeRoles } from "../tests/helpers/runtime-roles";
import "./environment";
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
      MIGRATION_DATABASE_URL: "",
      ADMIN_DATABASE_URL: "",
      DATABASE_URL: roles?.urls.reader ?? "",
      CAREOS_DATABASE_URL: roles?.urls.careos ?? "",
      GUARDIAN_DATABASE_URL: roles?.urls.guardian ?? "",
      CHECKOUT_DATABASE_URL: "",
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
