import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getEnvironment } from "../config";
import { createDatabase } from "../../db/connection";
import { assertDatabaseAuthority } from "../../db/authority";
import { readDemoData } from "../../db/read-demo";
import { demoData } from "./fixtures";

const globalDatabase = globalThis as unknown as {
  palcareDatabase?: ReturnType<typeof createDatabase>;
};

export const getDemoData = cache(async () => {
  await connection(); // Never pre-render a database-backed page during a build.
  const config = getEnvironment();
  if (config.dataSource === "fixtures")
    return { ...demoData, source: "fixtures" as const };
  if (!globalDatabase.palcareDatabase)
    globalDatabase.palcareDatabase = createDatabase(config.databaseUrl!, {
      readOnly: true,
    });
  try {
    await assertDatabaseAuthority(
      globalDatabase.palcareDatabase.pool,
      "reader",
    );
    return {
      ...(await readDemoData(globalDatabase.palcareDatabase.db)),
      source: "database" as const,
    };
  } catch {
    // No silent sample fallback after database errors. Never log a DSN or raw query.
    throw new Error(
      "Demo records are temporarily unavailable. Check migrations and seed setup.",
    );
  }
});
