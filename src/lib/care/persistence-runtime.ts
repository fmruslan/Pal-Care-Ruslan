import "server-only";
import { runtimeDatabase } from "../../db/runtime";
import { assertDatabaseAuthority, runtimeWriterUrl } from "../../db/authority";
import { getEnvironment } from "../config";
import { emptySavedCare, readSavedCare } from "./store";

/** Default off; no new table query before the separately approved rollout. */
export async function getSavedCare(twinId?: string) {
  if (process.env.CARE_RECORDS_ENABLED !== "true") return emptySavedCare();
  const config = getEnvironment();
  if (config.dataSource !== "database")
    throw Error("care_persistence_requires_database");
  const database = runtimeDatabase(
    runtimeWriterUrl("CARE_READER_DATABASE_URL"),
    { readOnly: true },
  );
  await assertDatabaseAuthority(database.pool, "care_reader", {
    requiredReads: ["care_cases", "care_case_events", "care_watches"],
  });
  return readSavedCare(database.pool, twinId);
}
