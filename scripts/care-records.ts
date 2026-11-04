// Private host-only command. No dotenv/admin/AI/provider credential loading.
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../src/db/authority";
import {
  appendManualCare,
  checkDueWatches,
  pauseWatches,
  saveWatch,
} from "../src/lib/care/store";

const [command, argument] = process.argv.slice(2);
const reporter = ["return", "warranty", "watch"].includes(command);
const worker = ["check", "pause", "resume"].includes(command);
try {
  if (!reporter && !worker) throw Error("care_command_not_supported");
  if (["pause", "resume"].includes(command) && !argument)
    throw Error("care_exact_watch_or_all_required");
  if (process.env.CARE_HOST_WRITES_ENABLED !== "true")
    throw Error("care_host_writes_disabled");
  const url = runtimeWriterUrl(
    reporter ? "CARE_REPORTER_DATABASE_URL" : "CARE_WATCH_DATABASE_URL",
  );
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw Error("care_private_loopback_required");
  const pool = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 10000,
  });
  try {
    await assertDatabaseAuthority(
      pool,
      reporter ? "care_reporter" : "care_worker",
    );
    let result: unknown;
    if (reporter) {
      if (!argument) throw Error("care_input_file_required");
      const text = await readFile(argument, "utf8");
      if (Buffer.byteLength(text) > 4096) throw Error("care_input_too_large");
      const value: unknown = JSON.parse(text);
      result =
        command === "watch"
          ? await saveWatch(pool, value)
          : await appendManualCare(
              pool,
              command as "return" | "warranty",
              value,
            );
    } else
      result =
        command === "check"
          ? await checkDueWatches(pool)
          : {
              changed: await pauseWatches(
                pool,
                command === "pause",
                argument === "all" ? undefined : argument,
              ),
            };
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
} catch {
  console.error(
    "Care host command stopped. Check the approved exact scope, input and restricted capability. No provider/model request was made.",
  );
  process.exitCode = 1;
}
