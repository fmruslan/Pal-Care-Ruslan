import "server-only";
import { runtimeDatabase } from "../../../db/runtime";
import {
  assertDatabaseAuthority,
  runtimeWriterUrl,
} from "../../../db/authority";
import { getEnvironment } from "../../config";
import { emptyProtection } from "./contracts";
import { readProtection } from "./store";
import type { ProtectionInput } from "./model";

export async function getProtection(twinId?: string) {
  if (process.env.CARE_PROTECTION_ENABLED !== "true")
    return { saved: emptyProtection(), inputs: [] as ProtectionInput[] };
  if (getEnvironment().dataSource !== "database")
    throw Error("protection_requires_database");
  const db = runtimeDatabase(
    runtimeWriterUrl("CARE_PROTECTION_READER_DATABASE_URL"),
    { readOnly: true },
  );
  await assertDatabaseAuthority(db.pool, "protection_reader");
  return readProtection(db.pool, twinId);
}
